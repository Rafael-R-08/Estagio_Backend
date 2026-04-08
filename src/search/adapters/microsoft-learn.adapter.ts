import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

/**
 * Catalog API — devolve o catálogo completo (~13 MB JSON).
 * Depreca em junho 2026. Migrar para a nova Learn Platform API quando disponível.
 * Docs: https://learn.microsoft.com/api/catalog/
 */
const MS_LEARN_CATALOG_URL = 'https://learn.microsoft.com/api/catalog/';
const MS_LEARN_SEARCH_URL = 'https://learn.microsoft.com/api/search';

/** Cache do catálogo completo: 24 horas */
const CATALOG_CACHE_TTL = 86400;
const CATALOG_CACHE_KEY = 'ms_learn:catalog:v1';

/** Tipos de conteúdo que nos interessam (valores reais da Catalog API) */
const ALLOWED_TYPES = new Set([
  'module',
  'learningPath',
  'cert',
  'exam',
  'course',
]);

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  beginner: 'beginner',
  introductory: 'beginner',
  iniciante: 'beginner',
  principiante: 'beginner',
  fundamental: 'beginner',
  intermediate: 'intermediate',
  intermédio: 'intermediate',
  intermedio: 'intermediate',
  advanced: 'advanced',
  expert: 'advanced',
  avançado: 'advanced',
  avancado: 'advanced',
};

/** Estrutura de um item na Catalog API */
interface CatalogItem {
  uid: string;
  title: string;
  summary?: string;
  url: string;
  type: string;
  levels?: string[];
  products?: string[];
  roles?: string[];
  subjects?: string[];
  duration_in_minutes?: number;
  duration_in_hours?: number;
  rating?: number | { count: number; average: number };
  popularity?: number;
  locale?: string;
  last_modified?: string;
  locales?: string[];
}

interface CatalogResponse {
  modules?: CatalogItem[];
  learningPaths?: CatalogItem[];
  certifications?: CatalogItem[];
  mergedCertifications?: CatalogItem[];
  appliedSkills?: CatalogItem[];
  exams?: CatalogItem[];
  courses?: CatalogItem[];
}

@Injectable()
export class MicrosoftLearnAdapter extends BasePlatformAdapter {
  readonly platformName = 'Microsoft Learn';
  protected readonly logger = new Logger(MicrosoftLearnAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, { id: 'mslearn', name: 'Microsoft Learn', config: {} });
  }

  async fetchResults(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // MS Learn é sempre gratuito

    // 1. Tentar pesquisa no catálogo completo (primário)
    const catalogResults = await this.searchInCatalog(query, limit);
    if (catalogResults.length > 0) return catalogResults;

    // 2. Fallback: API de search por query (secundário, limitado a 30 resultados)
    this.logger.warn(
      '[MS Learn] Catálogo indisponível, usando Search API como fallback.',
    );
    return this.searchViaApi(query, limit);
  }

  /**
   * Pesquisa no catálogo completo em cache local.
   * O catálogo completo é obtido uma vez por dia e filtrado em memória.
   */
  private async searchInCatalog(
    query: string,
    limit: number,
  ): Promise<CourseResult[]> {
    try {
      const catalog = await this.getFullCatalog();
      if (!catalog.length) return [];

      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);

      const scored = catalog
        .map((item) => {
          const haystack =
            `${item.title} ${item.summary ?? ''} ${(item.products ?? []).join(' ')} ${(item.roles ?? []).join(' ')}`.toLowerCase();
          const score = terms.reduce(
            (acc, t) => acc + (haystack.includes(t) ? 1 : 0),
            0,
          );
          return { item, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored.map(({ item }) => this.normalizeCatalogItem(item));
    } catch (err: any) {
      this.logger.error(
        `[MS Learn] Erro ao pesquisar catálogo: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Obtém o catálogo completo, usando cache de 24h.
   * Se forceRefresh=true, ignora cache e faz refetch imediato.
   */
  async getFullCatalog(forceRefresh = false): Promise<CatalogItem[]> {
    if (!forceRefresh) {
      const cached = await this.cache.get(CATALOG_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as CatalogItem[];
        } catch {
          // cache corrompido — refetch
        }
      }
    }

    try {
      this.logger.log('[MS Learn] A obter catálogo completo da Catalog API...');
      const response = await firstValueFrom(
        this.http
          .get<CatalogResponse>(MS_LEARN_CATALOG_URL, {
            headers: { Accept: 'application/json' },
            // decompress automaticamente — o catálogo é ~13 MB comprimido
          })
          .pipe(timeout(60_000)),
      );

      const data = response.data;
      const all: CatalogItem[] = [
        ...(data.modules ?? []),
        ...(data.learningPaths ?? []),
        ...(data.certifications ?? []),
        ...(data.mergedCertifications ?? []),
        ...(data.appliedSkills ?? []),
        ...(data.exams ?? []),
        ...(data.courses ?? []),
      ].filter((item) => ALLOWED_TYPES.has(item.type));

      this.logger.log(
        `[MS Learn] Catálogo carregado: ${all.length} itens. A guardar em cache por 24h.`,
      );
      await this.cache.set(
        CATALOG_CACHE_KEY,
        JSON.stringify(all),
        CATALOG_CACHE_TTL,
      );
      return all;
    } catch (err: any) {
      this.logger.error(
        `[MS Learn] Erro ao obter catálogo completo: ${err.message}`,
      );
      return [];
    }
  }

  /**
   * Devolve o catálogo completo já normalizado como CourseResult[].
   * Usado pelo CatalogSyncService para persistir na BD.
   */
  async getAllCourses(forceRefresh = false): Promise<CourseResult[]> {
    const catalog = await this.getFullCatalog(forceRefresh);
    return catalog.map((item) => this.normalizeCatalogItem(item));
  }

  /** Search API como fallback (limitado a 30 resultados por restrição da API) */
  private async searchViaApi(
    query: string,
    limit: number,
  ): Promise<CourseResult[]> {
    const fetchTop = Math.min(Math.max(limit * 3, 20), 30);
    try {
      const response = await firstValueFrom(
        this.http
          .get(MS_LEARN_SEARCH_URL, {
            params: {
              search: query,
              locale: 'en-us',
              $top: fetchTop,
              facet: 'category',
              $filter:
                "category eq 'Training' or category eq 'Certification' or category eq 'Applied Skills'",
            },
          })
          .pipe(timeout(15_000)),
      );

      const results = (response.data as { results?: unknown[] })?.results ?? [];
      return results.map((item) =>
        this.normalizeSearchItem(item as Record<string, unknown>),
      );
    } catch (err: any) {
      this.logger.error(`[MS Learn] Search API também falhou: ${err.message}`);
      return [];
    }
  }

  private normalizeCatalogItem(item: CatalogItem): CourseResult {
    const url = item.url.startsWith('http')
      ? item.url
      : `https://learn.microsoft.com${item.url}`;
    const externalId = `mslearn:${item.uid.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80)}`;

    const rawLevel = (item.levels?.[0] ?? '').toLowerCase();
    const level: CourseResult['level'] = LEVEL_MAP[rawLevel];

    const durationHours =
      item.duration_in_minutes != null
        ? parseFloat((item.duration_in_minutes / 60).toFixed(2))
        : item.duration_in_hours != null
          ? item.duration_in_hours
          : undefined;

    let description = item.summary ?? '';
    if (description.length > 300)
      description = description.slice(0, 300) + '...';

    // locale: prefer 'en-us' from locales array if present, else item.locale
    const locale = item.locale ?? (item.locales?.find(l => l === 'en-us') ?? item.locales?.[0]) ?? 'en-us';

    return {
      externalId,
      title: item.title,
      description,
      url,
      instructor: 'Microsoft Learn',
      language: locale.split('-')[0],
      level,
      durationHours,
      rating: typeof item.rating === 'object' && item.rating !== null
        ? (item.rating as any).average ?? undefined
        : (item.rating as number | undefined),
      isFree: true,
      tags: [...(item.products ?? []), ...(item.roles ?? []), ...(item.subjects ?? [])],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  private normalizeSearchItem(item: Record<string, unknown>): CourseResult {
    const url = String(item.url ?? item.displayUrl ?? '');
    const externalId = `mslearn:${this.urlToId(url)}`;

    const rawLevel = String((item.levels as string[])?.[0] ?? '').toLowerCase();
    const level: CourseResult['level'] =
      LEVEL_MAP[rawLevel] ??
      this.extractLevelFromText(String(item.description ?? item.summary ?? ''));

    const description = String(item.description ?? item.summary ?? '')
      .replace(/At a glance.*(Skill|Product|Role|Subject).*\b/is, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .slice(0, 300);

    const durationText = String(item.description ?? item.summary ?? '');
    const durationHours = this.extractDurationFromText(durationText);

    return {
      externalId,
      title: String(item.title ?? 'Sem título'),
      description,
      url,
      instructor: String(item.author ?? item.creator ?? 'Microsoft Learn'),
      language: String(item.locale ?? 'en-us').split('-')[0],
      level,
      durationHours,
      isFree: true,
      tags: [
        ...((item.products as string[]) ?? []),
        ...((item.roles as string[]) ?? []),
      ],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  private extractLevelFromText(
    text: string,
  ): CourseResult['level'] | undefined {
    const match = text.match(
      /(Level|Nível|Nivel|Dificuldade)[:\s]+(Beginner|Intermediate|Advanced|Introductory|Expert|Iniciante|Intermédio|Avançado|Fundamental)/i,
    );
    if (!match) return undefined;
    return LEVEL_MAP[match[2].toLowerCase()];
  }

  private extractDurationFromText(text: string): number | undefined {
    const hMinMatch = text.match(
      /(\d+)\s*(h|hr|hrs|hora|horas)\s*(\d+)\s*(m|min|mins|minuto|minutos)/i,
    );
    if (hMinMatch)
      return parseFloat(
        (parseInt(hMinMatch[1]) + parseInt(hMinMatch[3]) / 60).toFixed(2),
      );

    const hMatch = text.match(/(\d+)\s*(h|hr|hrs|hora|horas)\b/i);
    if (hMatch) return parseInt(hMatch[1]);

    const minMatch = text.match(
      /(\d+)\s*(m|min|mins|minuto|minutos|minute|minutes)/i,
    );
    if (minMatch) return parseFloat((parseInt(minMatch[1]) / 60).toFixed(2));

    return undefined;
  }

  private urlToId(url: string): string {
    try {
      const path = new URL(url).pathname;
      return path.replace(/\//g, '_').replace(/^_/, '');
    } catch {
      return Buffer.from(url).toString('base64').slice(0, 40);
    }
  }
}
