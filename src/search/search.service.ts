import { Injectable, Logger } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchOrchestratorService } from './search-orchestrator.service';
import { CourseDbService } from './course-db.service';
import { PlatformRegistry } from './platform.registry';
import { SemanticRankingService } from './semantic-ranking.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly orchestrator: SearchOrchestratorService,
    private readonly dbService: CourseDbService,
    private readonly registry: PlatformRegistry,
    private readonly ranking: SemanticRankingService,
  ) {}

  /**
   * Facada para a pesquisa unificada principal.
   */
  async search(dto: SearchQueryDto, userId?: string) {
    // userId pode ser usado para personalização futura (recomendações)
    return this.orchestrator.unifiedSearch(dto);
  }

  /**
   * Pesquisa puramente semântica (Vector Store).
   */
  async semanticSearch(dto: SearchQueryDto, userId?: string) {
    // Redireciona para o orquestrador mas focado em ranking semântico pesado
    return this.orchestrator.unifiedSearch({
      ...dto,
      minRelevance: dto.minRelevance || 0.1, // Força um mínimo de relevância
    });
  }

  /**
   * Detalhe de um curso.
   */
  async getCourseByExternalId(externalId: string) {
    return this.dbService.findGlobalByExternalId(externalId);
  }

  /**
   * Cursos relacionados via similaridade semântica.
   */
  async getRelatedCourses(externalId: string, limit = 5) {
    const course = await this.getCourseByExternalId(externalId);
    if (!course) return [];
    
    return this.ranking.rankResults(course.title, []); // Simplificado: busca por título
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
