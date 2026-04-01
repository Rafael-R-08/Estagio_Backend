import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

/**
 * Adapter para a plataforma interna Softinsa Everyday Learning.
 * 
 * TODO: Ajustar endpoints e autenticação quando a especificação da API estiver disponível.
 * Atualmente assume uma API REST standard que retorna uma lista de cursos.
 */
@Injectable()
export class SoftinsaEverydayLearningAdapter extends BasePlatformAdapter {
  readonly platformName = 'Softinsa Everyday Learning';
  protected readonly logger = new Logger(SoftinsaEverydayLearningAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    // Config inicial, será sobrescrita pela base class se houver na DB
    super(cache, { id: 'softinsael', name: 'Softinsa Everyday Learning', config: {} });
  }

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    const apiUrl = this.platform.apiEndpoint;
    if (!apiUrl) {
      this.logger.warn(`[${this.platformName}] apiEndpoint não configurado. Ignorando pesquisa.`);
      return [];
    }

    try {
      // Exemplo de chamada REST. Ajustar headers (ex: Bearer token) conforme necessário.
      const response = await firstValueFrom(
        this.http
          .get(apiUrl, {
            params: {
              q: query,
              limit,
              // Adicionar filtros conforme a API suportar
              free: filters?.isFree,
            },
            headers: {
              // 'Authorization': `Bearer ${this.platform.config.apiKey}`,
              'Accept': 'application/json',
            },
          })
          .pipe(timeout(10_000)),
      );

      const rawResults = Array.isArray(response.data) ? response.data : (response.data as any)?.results ?? [];
      return rawResults.map((item: any) => this.normalize(item));
    } catch (error: unknown) {
      this.logger.error(`[${this.platformName}] Erro ao consultar API interna: ${String(error)}`);
      return [];
    }
  }

  private normalize(item: any): CourseResult {
    // Mapeamento placeholder. Ajustar campos reais da API Softinsa.
    return {
      externalId: `softinsael:${item.id || item.code}`,
      title: item.title || item.name || 'Sem título',
      description: item.description || item.summary || '',
      url: item.url || item.link || '',
      level: item.level as any,
      isFree: item.isFree ?? true,
      tags: Array.isArray(item.tags) ? item.tags : [],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }
}
