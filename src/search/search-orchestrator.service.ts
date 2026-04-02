import { Injectable, Logger } from '@nestjs/common';
import { CourseDbService } from './course-db.service';
import { PlatformRegistry } from './platform.registry';
import { SemanticRankingService } from './semantic-ranking.service';
import { CourseEnrichmentService } from './course-enrichment.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { CourseResult } from './interfaces/platform-adapter.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChunkSource } from '@prisma/client';
import { isLikelyTrainingResult } from './utils/training-result-filter.util';

@Injectable()
export class SearchOrchestratorService {
  private readonly logger = new Logger(SearchOrchestratorService.name);

  constructor(
    private readonly platformRegistry: PlatformRegistry,
    private readonly dbService: CourseDbService,
    private readonly rankingService: SemanticRankingService,
    private readonly enrichmentService: CourseEnrichmentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Orquestrador principal da pesquisa unificada.
   * Coordena adaptadores, cache DB, ranking semântico e enriquecimento.
   */
  async unifiedSearch(queryDto: SearchQueryDto) {
    const { q, limit = 10, page = 1, platforms, isFree, minRating, minRelevance = 0 } = queryDto;
    
    this.logger.log(`Iniciando pesquisa unificada para: "${q}" (Plataformas: ${platforms?.join(', ') || 'Todas'})`);

    // 1. Pesquisa na Cache Local (BD) - Primeiro passo para rapidez
    const cachedResults = await this.dbService.searchFromCache(q, limit, { 
       isFree, 
       minRating, 
       minRelevance, 
       platforms 
    });

    // 2. Pesquisa Externa (Adaptadores)
    const allAdapters = await this.platformRegistry.getActiveAdapters();
    const targetAdapters = platforms && platforms.length > 0
      ? allAdapters.filter(a => platforms.includes(a.platformName))
      : allAdapters;

    const externalResultsRaw = await Promise.allSettled(
      targetAdapters.map(async (adapter) => ({
        platformId: (adapter as any).platform.id,
        results: await adapter.search(q, limit, { isFree, minRating, minRelevance })
      }))
    );

    const externalResults: CourseResult[] = [];
    for (const res of externalResultsRaw) {
      if (res.status === 'fulfilled' && res.value.results.length > 0) {
        const { platformId, results } = res.value;
        const filteredResults = results.filter((r) => isLikelyTrainingResult(r));
        externalResults.push(...filteredResults);
        
        // Background: Gravar novos resultados na cache DB sem bloquear o request principal
        void this.dbService.cacheResults(platformId, filteredResults);
      }
    }

    // 3. Combinação e Deduplicação (por URL)
    const combined = this.deduplicateResults([...cachedResults, ...externalResults])
      .filter((r) => isLikelyTrainingResult(r));

    // 4. Ranking Semântico (AI)
    const ranked = await this.rankingService.rankResults(q, combined);

    // 5. Enriquecimento com estatísticas internas (ratings Softinsa)
    const enriched = await this.enrichmentService.enrichWithInternalStats(ranked);

    // 6. Cálculo de Relevância Softinsa (0.0 - 1.0)
    const finalResults = enriched.map(course => {
      const queryKeywords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      
      // A) Tags Match (50%)
      const matchedTags = course.tags.filter(t => 
        queryKeywords.some(kw => t.toLowerCase().includes(kw))
      ).length;
      const tagsScore = Math.min((matchedTags / (queryKeywords.length || 1)), 1) * 0.50;

      // B) Title Match (25%)
      const titleLower = course.title.toLowerCase();
      const titleMatch = queryKeywords.some(kw => titleLower.includes(kw)) ? 1 : 0;
      const titleScore = titleMatch * 0.25;

      // C) Semantic Score (15%) - de 0-1
      const semanticScore = (course.similarityScore || 0) * 0.15;

      // D) Platform/Internal Preference (10%)
      const internalScore = (course.platformName.toLowerCase().includes('internal') || (course.internalRating || 0) >= 4) ? 0.10 : 0;

      const finalScore = parseFloat((tagsScore + titleScore + semanticScore + internalScore).toFixed(4));
      
      return { 
        ...course, 
        relevanceScore: finalScore 
      };
    }).filter(r => (r.relevanceScore || 0) >= minRelevance);

    // 7. Paginação e Resposta Final
    const total = finalResults.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedResults = finalResults.slice((page - 1) * limit, page * limit);

    // DEBUG: Confirm metadata of results in file
    try {
      const fs = require('fs');
      fs.writeFileSync('/tmp/debug-search.json', JSON.stringify(paginatedResults, null, 2));
      const first = paginatedResults[0];
      this.logger.log(`[SEARCH_DEBUG] Primeiro Resultado: "${first.title}" | Level: ${first.level} | Duration: ${first.durationHours}h | Language: ${first.language}`);
    } catch (err) {}

    // 8. Evento para indexação assíncrona de novos conteúdos (Alinhado com novo contrato)
    if (externalResults.length > 0) {
      this.eventEmitter.emit('course.batch_created', {
        courses: externalResults.map(c => ({
          externalId: c.externalId,
          platformId: c.platformId,
          title: c.title,
          description: c.description,
          provider: c.platformName,
          category: c.tags?.[0],
          difficulty: c.level,
          source: ChunkSource.EXTERNAL_COURSE
        }))
      });
    }

    return {
      query: q,
      total,
      totalPages,
      page,
      limit,
      results: paginatedResults,
      platformsAnalyzed: targetAdapters.map(a => a.platformName),
      timestamp: new Date().toISOString()
    };
  }

  private deduplicateResults(results: CourseResult[]): CourseResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      const key = r.url.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
