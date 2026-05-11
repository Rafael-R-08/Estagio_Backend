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
  async unifiedSearch(queryDto: SearchQueryDto, userId?: string) {
    const { q = '', limit = 10, page = 1, platforms, isFree, minRating, minInternalRating, minRelevance = 0, level, language } = queryDto;
    const isBrowseMode = !q || !q.trim();
    this.logger.log(`Iniciando pesquisa unificada para: "${q}" (Plataformas Recebidas: ${platforms?.join(', ') || 'Todas'})`);

    // 2. Normalizar nomes de plataformas para match exato com DB/Adapters
    const allAdapters = await this.platformRegistry.getActiveAdapters();
    const normalizedPlatforms = (platforms || []).map(p => {
      const match = allAdapters.find(a => 
        a.platformName.toLowerCase() === p.toLowerCase() ||
        a.platformName.toLowerCase().replace(/\s+/g, '-') === p.toLowerCase()
      );
      return match ? match.platformName : p;
    });
    this.logger.log(`Plataformas Normalizadas: ${normalizedPlatforms.join(', ')}`);


    // 1. Pesquisa na Cache Local (BD) - Primeiro passo para rapidez
    const cachedResults = await this.dbService.searchFromCache(q, limit, { 
       isFree, 
       minRating, 
       minRelevance, 
       platforms: normalizedPlatforms.length > 0 ? normalizedPlatforms : undefined,
       level: level as string | undefined,
       language 
    });

    const targetAdapters = normalizedPlatforms.length > 0
      ? allAdapters.filter(a => normalizedPlatforms.includes(a.platformName))
      : allAdapters;
    this.logger.log(`Adaptadores Selecionados: ${targetAdapters.map(a => a.platformName).join(', ')}`);

    // 3. Pesquisa Externa (Adaptadores) — ignorada em browse mode para reduzir latência
    const externalResults: CourseResult[] = [];
    if (!isBrowseMode) {
      const externalResultsRaw = await Promise.allSettled(
        targetAdapters.map(async (adapter) => ({
          platformId: (adapter as any).platform.id,
          results: await adapter.search(q, limit, { isFree, minRating, minRelevance })
        }))
      );

      for (const res of externalResultsRaw) {
        if (res.status === 'fulfilled' && res.value.results.length > 0) {
          const { platformId, results } = res.value;
          const filteredResults = results.filter((r) => isLikelyTrainingResult(r));
          externalResults.push(...filteredResults);
          
          // Background: Gravar novos resultados na cache DB sem bloquear o request principal
          void this.dbService.cacheResults(platformId, filteredResults);
        } else if (res.status === 'rejected') {
          this.logger.error(`Falha no adaptador externo: ${res.reason}`);
        }
      }
    }

    // 4. Combinação e Deduplicação (por URL)
    const combined = this.deduplicateResults([...cachedResults, ...externalResults])
      .filter((r) => isLikelyTrainingResult(r));

    // 5. Filtro pós-combinação por minRating (garante que resultados externos também cumprem o critério)
    const ratingFiltered = minRating !== undefined
      ? combined.filter(r => r.rating === undefined || r.rating >= minRating)
      : combined;

    // 6. Ranking Semântico (AI) — desativado em browse mode (sem query significativa)
    const ranked = isBrowseMode
      ? ratingFiltered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      : await this.rankingService.rankResults(q, ratingFiltered);

    // 7. Enriquecimento com estatísticas internas (ratings Softinsa)
    const enriched = await this.enrichmentService.enrichWithInternalStats(ranked);

    // 7b. Enriquecimento com estado do utilizador autenticado (guardado, frequentado, realizado)
    const enrichedWithStatus = userId
      ? await this.enrichmentService.enrichWithUserStatus(enriched, userId)
      : enriched;

    // 8. Filtro por minInternalRating (rating médio interno dos utilizadores Softinsa)
    const internalFiltered = minInternalRating !== undefined
      ? enrichedWithStatus.filter(r => r.internalRating !== undefined && r.internalRating >= minInternalRating)
      : enrichedWithStatus;

    // 9. Cálculo de Relevância Softinsa (0.0 - 1.0)
    const finalResults = isBrowseMode
      ? internalFiltered.map(course => ({ ...course, relevanceScore: 1 }))
      : internalFiltered.map(course => {
          const queryKeywords = q.toLowerCase().split(/\s+/).filter(w => w.length >= 1);
          
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

    // 10. Paginação e Total
    // Em browse mode: obter total real da BD para o banner "X+ formações disponíveis"
    const totalAvailable = isBrowseMode
      ? await this.dbService.countAll({ isFree, minRating, platforms })
      : finalResults.length;

    const total = totalAvailable;
    const totalPages = Math.ceil(total / limit);
    const paginatedResults = finalResults.slice((page - 1) * limit, page * limit);

    // DEBUG: Confirm metadata of results in file
    try {
      const fs = require('fs');
      fs.writeFileSync('/tmp/debug-search.json', JSON.stringify(paginatedResults, null, 2));
      const first = paginatedResults[0];
      if (first) {
        this.logger.log(`[SEARCH_DEBUG] Primeiro Resultado: "${first.title}" | Level: ${first.level} | Duration: ${first.durationHours}h | Language: ${first.language}`);
      }
    } catch (err) {}

    // 11. Evento para indexação assíncrona de novos conteúdos (Alinhado com novo contrato)
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
