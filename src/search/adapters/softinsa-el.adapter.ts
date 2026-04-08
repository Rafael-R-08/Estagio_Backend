import { Injectable, Logger } from '@nestjs/common';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

/**
 * Adapter para a plataforma interna Softinsa Everyday Learning.
 *
 * Estado atual: SEM acesso à API interna (pendente de contrato/credenciais da equipa TI Softinsa).
 * O adapter está desativado e retorna sempre [].
 *
 * Quando disponível, configurar na DB:
 *   platform.apiEndpoint  = URL base da API
 *   platform.config.apiKey = Bearer token (JWT)
 *   platform.config.mode   = 'api'             (default)
 *                          | 'csv'             (export CSV)
 *
 * Mapeamento esperado dos campos da API:
 *   id / code    → externalId
 *   title / name → title
 *   description / summary → description
 *   url / link   → url
 *   level        → level ('beginner' | 'intermediate' | 'advanced')
 *   isFree       → isFree (assumir true se omitido)
 *   tags         → tags
 */
@Injectable()
export class SoftinsaEverydayLearningAdapter extends BasePlatformAdapter {
  readonly platformName = 'Softinsa Everyday Learning';
  protected readonly logger = new Logger(SoftinsaEverydayLearningAdapter.name);

  constructor(cache: CacheService) {
    super(cache, { id: 'softinsael', name: 'Softinsa Everyday Learning', config: {} });
  }

  async fetchResults(
    _query: string,
    _limit: number,
    _filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    this.logger.debug(
      '[Softinsa EL] Adapter desativado: credenciais da API interna não disponíveis.',
    );
    return [];
  }
}
