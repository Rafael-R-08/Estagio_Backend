import { Injectable, Logger } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { CourseDbService } from './course-db.service';
import { PlatformRegistry } from './platform.registry';
import { SemanticRankingService } from './semantic-ranking.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { ChunkSource } from '@prisma/client';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly orchestrator: SearchOrchestratorService,
    private readonly dbService: CourseDbService,
    private readonly registry: PlatformRegistry,
    private readonly ranking: SemanticRankingService,
    private readonly embedding: EmbeddingService,
  ) {}

  /**
   * Facada para a pesquisa unificada principal.
   */
  async search(dto: SearchQueryDto, userId?: string) {
    return this.orchestrator.unifiedSearch(dto, userId);
  }

  /**
   * Pesquisa puramente semântica (Vector Store).
   */
  async semanticSearch(dto: SearchQueryDto, userId?: string) {
    // Redireciona para o orquestrador mas focado em ranking semântico pesado
    return this.orchestrator.unifiedSearch({
      ...dto,
      minRelevance: dto.minRelevance || 0.1, // Força um mínimo de relevância
    }, userId);
  }

  /**
   * Detalhe de um curso, opcionalmente enriquecido com o estado do utilizador.
   */
  async getCourseByExternalId(externalId: string, userId?: string) {
    return this.dbService.findGlobalByExternalId(externalId, userId);
  }

  /**
   * Cursos relacionados via similaridade semântica.
   */
  async getRelatedCourses(externalId: string, limit = 5) {
    const course = await this.getCourseByExternalId(externalId);
    if (!course) return [];
    
    this.logger.log(`Procurando cursos relacionados para: "${course.title}" (${externalId})`);

    // Busca semântica baseada no título e descrição do curso atual
    const query = `${course.title}. ${course.description || ''}`;
    const results = await this.embedding.searchSimilar(query, limit + 1, [ChunkSource.EXTERNAL_COURSE]);

    // Filtrar o próprio curso do resultado
    return results
      .filter(r => r.sourceId !== externalId)
      .slice(0, limit)
      .map(r => ({
        externalId: r.sourceId,
        title: r.content.split('. ')[0].replace('CURSO: ', ''), // Extração simples para compatibilidade
        similarity: r.similarity,
        metadata: r.metadata
      }));
  }

  /**
   * Lista plataformas configuradas.
   */
  async getAvailablePlatforms() {
    const active = await this.registry.getActiveAdapters();
    return active.map(a => ({
      id: a.platformName.toLowerCase().replace(/\s+/g, '-'),
      name: a.platformName,
      slug: a.platformName.toLowerCase().replace(/\s+/g, '-'),
      status: 'active'
    }));
  }
}
