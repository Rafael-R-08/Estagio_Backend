import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://academiaportugaldigital.pt';
const COURSES_URL = `${BASE_URL}/cursos`;

/** Cache do catálogo: 12 horas */
const CATALOG_CACHE_TTL = 43200;
const ACADEMIA_CATALOG_CACHE_KEY = 'academia_pt:catalog:v2';

/** Número máximo de páginas a percorrer (evita loops infinitos) */
const MAX_PAGES = 10;

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  iniciado: 'beginner',
  intermédio: 'intermediate',
  avançado: 'advanced',
  intermediate: 'intermediate',
  advanced: 'advanced',
  beginner: 'beginner',
};

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
};

@Injectable()
export class AcademiaPortugalDigitalAdapter extends BasePlatformAdapter {
  readonly platformName = 'Academia Portugal Digital';
  protected readonly logger = new Logger(AcademiaPortugalDigitalAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, {
      id: 'academiapt',
      name: 'Academia Portugal Digital',
      config: {},
    });
  }

  async fetchResults(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // Academia PT é sempre gratuito

    const allCourses = await this.getAllCourses();
    if (allCourses.length === 0) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return (
      allCourses
        .map((c) => {
          const haystack =
            `${c.title} ${c.description} ${c.tags.join(' ')}`.toLowerCase();
          const matchCount = terms.reduce(
            (acc, t) => acc + (haystack.includes(t) ? 1 : 0),
            0,
          );
          return { ...c, _score: matchCount };
        })
        .filter((c) => c._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, limit)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ _score: __omit, ...rest }) => rest)
    );
  }

  /** Obtém todos os cursos percorrendo paginação automática (cache 12h). Se forceRefresh=true, ignora cache. */
  async getAllCourses(forceRefresh = false): Promise<CourseResult[]> {
    if (!forceRefresh) {
      const cached = await this.cache.get(ACADEMIA_CATALOG_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as CourseResult[];
        } catch {
          /* cache corrompido */
        }
      }
    }

    const allResults: CourseResult[] = [];
    const seen = new Set<string>();
    let page = 0;
    let hasMore = true;

    while (hasMore && page < MAX_PAGES) {
      const url = page === 0 ? COURSES_URL : `${COURSES_URL}?page=${page}`;
      try {
        const response = await firstValueFrom(
          this.http
            .get<string>(url, {
              headers: REQUEST_HEADERS,
              responseType: 'text',
            })
            .pipe(timeout(20_000)),
        );

        const html = response.data;
        const pageResults = this.parseHtml(html, seen);
        allResults.push(...pageResults);

        // Detetar se existe próxima página
        hasMore = this.hasNextPage(html, page);
        page++;

        if (pageResults.length === 0) {
          // Página vazia — parar mesmo que exista link de paginação
          hasMore = false;
        }

        this.logger.debug(
          `[Academia PT Digital] Página ${page}: ${pageResults.length} cursos (total: ${allResults.length})`,
        );
      } catch (error: unknown) {
        this.logger.error(
          `[Academia PT Digital] Erro na página ${page}: ${String(error)}`,
        );
        hasMore = false;
      }
    }

    if (allResults.length > 0) {
      await this.cache.set(
        ACADEMIA_CATALOG_CACHE_KEY,
        JSON.stringify(allResults),
        CATALOG_CACHE_TTL,
      );
      this.logger.log(
        `[Academia PT Digital] Catálogo carregado: ${allResults.length} cursos em ${page} páginas (cache 12h).`,
      );
    }

    return allResults;
  }

  /**
   * Verifica se existe uma próxima página de resultados.
   * Suporta múltiplos padrões de paginação: Drupal Views, rel="next", botões "Próximo".
   */
  private hasNextPage(html: string, currentPage: number): boolean {
    const $ = cheerio.load(html);

    // 1. Link rel="next" (padrão HTML semântico)
    if ($('link[rel="next"], a[rel="next"]').length > 0) return true;

    // 2. Paginador Drupal Views: .pager-next ou li.next
    if ($('.pager__item--next, .pager-next, li.next a, a.page-next').length > 0)
      return true;

    // 3. Link "?page=" para a próxima página
    const nextPageNum = currentPage + 1;
    if (
      $(`a[href*="page=${nextPageNum}"], a[href*="?page=${nextPageNum}"]`)
        .length > 0
    )
      return true;

    // 4. Botão "Seguinte" / "Próximo" / "Next" em texto
    let found = false;
    $('a, button').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (/^(next|próxim|seguinte|>|›)/.test(text)) {
        found = true;
        return false; // break
      }
    });
    return found;
  }

  private parseHtml(html: string, seen: Set<string>): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];

    // Seletores multi-fallback para resiliência a redesigns
    const cardSelectors = [
      '.views-row',
      '.course-card',
      '.field-content article',
      'article',
      '.card',
      '[class*="course"]',
    ];

    for (const cardSelector of cardSelectors) {
      const cards = $(cardSelector);
      if (cards.length < 2) continue;

      cards.each((_, el) => {
        const card = $(el);

        // Tentar encontrar título via seletores em cascata
        const titleEl = card
          .find('h2, h3, h4, .title, a[href*="/formacao/"], a[href*="/curso/"]')
          .first();
        const title = titleEl.text().trim();
        if (!title || seen.has(title)) return;

        // Tentar encontrar URL do curso
        const link =
          titleEl.attr('href') ??
          card.find('a[href*="/formacao/"], a[href*="/curso/"]').attr('href') ??
          card.find('a').first().attr('href') ??
          '';
        if (!link) return;

        const url = link.startsWith('http') ? link : `${BASE_URL}${link}`;

        // Validação básica: URL deve ser do domínio da academia
        if (!url.startsWith(BASE_URL) && !url.startsWith('http')) return;

        const description = card
          .find('.description, .summary, .field--name-body, p')
          .first()
          .text()
          .trim();

        // Metadata: "Iniciado | 3h 0m | Português" ou variações
        const metaText = card.text();
        const metaMatch = metaText.match(
          /(Iniciado|Intermédio|Avançado)\s*[|·]\s*(\d+)h\s*(\d+)m?\s*[|·]?\s*(\w+)?/i,
        );

        let level: CourseResult['level'] = undefined;
        let durationHours: number | undefined = undefined;

        if (metaMatch) {
          level = LEVEL_MAP[metaMatch[1].toLowerCase()];
          const h = parseInt(metaMatch[2], 10);
          const m = parseInt(metaMatch[3] ?? '0', 10);
          durationHours = h + m / 60;
        } else {
          // Fallback: detetar nível e duração separadamente
          const levelMatch = metaText.match(
            /\b(Iniciado|Intermédio|Avançado)\b/i,
          );
          if (levelMatch) level = LEVEL_MAP[levelMatch[1].toLowerCase()];

          const durMatch = metaText.match(/(\d+)h\s*(\d+)?m?/i);
          if (durMatch) {
            durationHours =
              parseInt(durMatch[1], 10) + parseInt(durMatch[2] ?? '0', 10) / 60;
          }
        }

        const titleSlug = title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        seen.add(title);
        results.push({
          externalId: `academiapt:${titleSlug.slice(0, 60)}`,
          title,
          description: description.slice(0, 400),
          url,
          level,
          durationHours: durationHours
            ? parseFloat(durationHours.toFixed(2))
            : undefined,
          isFree: true,
          tags: [],
          platformId: this.platform.id,
          platformName: this.platformName,
        });
      });

      if (results.length > 0) break;
    }

    return results;
  }
}
