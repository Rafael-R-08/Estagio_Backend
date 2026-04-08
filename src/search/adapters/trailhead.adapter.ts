import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

/**
 * URL de pesquisa com filtro de tipos relevantes:
 * module, trail, superbadge — excluímos "blog" e "help" que aparecem nas pesquisas genéricas.
 */
const BASE_URL = 'https://trailhead.salesforce.com';
const SEARCH_URL = `${BASE_URL}/en/search`;

/** Padrões de URL que indicam conteúdo de aprendizagem válido no Trailhead */
const VALID_URL_PATTERNS = [
  '/content/learn/',
  '/trails/',
  '/modules/',
  '/superbadges/',
];

/** Seletores de card em múltiplas versões do layout Trailhead */
const CARD_SELECTORS = [
  // 2024–2026 layout
  '[data-testid="search-result-card"]',
  '[data-testid="th-card"]',
  // Layouts anteriores
  '.th-card',
  '.tds-card',
  // Genérico — último recurso
  'article[class*="card"]',
  'div[class*="ResultCard"]',
  'div[class*="result-card"]',
];

/** Seletores de título dentro de um card */
const TITLE_SELECTORS = [
  '[data-testid="card-title"]',
  '[data-testid="th-card-title"]',
  '.th-card__title',
  '.tds-card__title',
  'h3',
  'h2',
];

/** Seletores de descrição dentro de um card */
const DESC_SELECTORS = [
  '[data-testid="card-description"]',
  '[data-testid="th-card-description"]',
  '.th-card__description',
  '.tds-card__description',
  'p',
];

/** Cache do catálogo por sitemap: 24 horas */
const CATALOG_CACHE_TTL = 86400;
const TRAILHEAD_CATALOG_CACHE_KEY = 'trailhead:catalog:v1';

/** URLs do sitemap Trailhead (tentadas em ordem) */
const SITEMAP_URLS = [
  `${BASE_URL}/sitemap.xml`,
  `${BASE_URL}/sitemap_index.xml`,
];

/** Padrões de caminho de URL que indicam conteúdo de aprendizagem no sitemap */
const SITEMAP_PATH_PATTERNS = [
  /\/(?:en\/)?content\/learn\/modules\/([^/?#]+)/,
  /\/(?:en\/)?content\/learn\/trails\/([^/?#]+)/,
  /\/(?:en\/)?content\/learn\/superbadges\/([^/?#]+)/,
];

@Injectable()
export class TrailheadAdapter extends BasePlatformAdapter {
  readonly platformName = 'Trailhead';
  protected readonly logger = new Logger(TrailheadAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, { id: 'trailhead', name: 'Trailhead', config: {} });
  }

  async fetchResults(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // Trailhead é sempre gratuito

    let html: string;
    try {
      // Filtrar por tipos de conteúdo (module, trail, superbadge) para reduzir ruído
      const response = await firstValueFrom(
        this.http
          .get<string>(SEARCH_URL, {
            params: {
              keywords: query,
              // Filtro de tipo nativo da Trailhead search
              type: 'module,trail,superbadge',
            },
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );
      html = response.data;
    } catch (error: unknown) {
      this.logger.error(`[Trailhead] Erro ao pesquisar: ${String(error)}`);
      return [];
    }

    return this.parseHtml(html).slice(0, limit);
  }

  private parseHtml(html: string): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // Estratégia A: JSON-LD (mais estruturado) — tentamos primeiro
    this.parseJsonLd($, seen, results);

    // Estratégia B: Cards HTML com multi-selector
    if (results.length < 3) {
      this.parseCards($, seen, results);
    }

    return results;
  }

  private parseJsonLd(
    $: cheerio.CheerioAPI,
    seen: Set<string>,
    results: CourseResult[],
  ): void {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? '{}');
        const root = Array.isArray(json) ? json : [json];

        for (const obj of root) {
          const items: any[] =
            obj.itemListElement ??
            (obj['@type'] === 'ItemList' ? [] : null) ??
            (obj['@type'] === 'Course' ? [obj] : []);

          for (const listItem of items) {
            const item = listItem.item ?? listItem;
            if (!item?.name || seen.has(item.name)) continue;

            const rawUrl = String(item.url ?? '');
            const fullUrl = rawUrl.startsWith('http')
              ? rawUrl
              : rawUrl
                ? `${BASE_URL}${rawUrl}`
                : '';
            if (
              !fullUrl ||
              !VALID_URL_PATTERNS.some((p) => fullUrl.includes(p))
            )
              continue;

            seen.add(item.name);
            const slug = fullUrl.split('/').filter(Boolean).pop() ?? item.name;

            results.push({
              externalId: `trailhead:${slug.slice(0, 60)}`,
              title: String(item.name),
              description: String(item.description ?? '').slice(0, 500),
              url: fullUrl,
              isFree: true,
              tags: [],
              platformId: this.platform.id,
              platformName: this.platformName,
            });
          }
        }
      } catch {
        /* JSON inválido */
      }
    });
  }

  private parseCards(
    $: cheerio.CheerioAPI,
    seen: Set<string>,
    results: CourseResult[],
  ): void {
    // Tentar cada seletor de card até encontrar um com resultados
    for (const cardSelector of CARD_SELECTORS) {
      const cards = $(cardSelector);
      if (cards.length === 0) continue;

      cards.each((_, el) => {
        const card = $(el);

        // Extrair título usando seletores em cascata
        let title = '';
        for (const sel of TITLE_SELECTORS) {
          title = card.find(sel).first().text().trim();
          if (title) break;
        }
        if (!title || seen.has(title)) return;

        // Tentar encontrar URL válida de aprendizagem
        let url = '';
        card.find('a').each((_, a) => {
          const href = $(a).attr('href') ?? '';
          if (VALID_URL_PATTERNS.some((p) => href.includes(p))) {
            url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            return false; // break
          }
        });
        if (!url) return;

        seen.add(title);

        // Extrair descrição
        let description = '';
        for (const sel of DESC_SELECTORS) {
          description = card.find(sel).first().text().trim();
          if (description && description !== title) break;
        }

        const metaText = card.text().toLowerCase();

        const level: CourseResult['level'] = metaText.includes('beginner')
          ? 'beginner'
          : metaText.includes('intermediate')
            ? 'intermediate'
            : metaText.includes('advanced')
              ? 'advanced'
              : undefined;

        const timeMatch = metaText.match(/(\d+)\s*(mins?|hrs?|hours?)/);
        let durationHours: number | undefined;
        if (timeMatch) {
          const val = parseInt(timeMatch[1], 10);
          durationHours = timeMatch[2].startsWith('m')
            ? parseFloat((val / 60).toFixed(2))
            : val;
        }

        const tags: string[] = [];
        card
          .find(
            '.th-card__tags span, [data-testid="card-tag"], .badge, [class*="tag"], [class*="Tag"]',
          )
          .each((_, tagEl) => {
            const tag = $(tagEl).text().trim();
            if (tag && tag.length < 50) tags.push(tag);
          });

        const slug =
          url.split('/').filter(Boolean).pop() ??
          title.toLowerCase().replace(/\s+/g, '-');

        results.push({
          externalId: `trailhead:${slug.slice(0, 60)}`,
          title,
          description: description.slice(0, 500),
          url,
          level,
          durationHours: durationHours
            ? parseFloat(durationHours.toFixed(2))
            : undefined,
          isFree: true,
          tags,
          platformId: this.platform.id,
          platformName: this.platformName,
        });
      });

      if (results.length >= 3) break;
    }
  }

  // ─── Catalog via sitemap ────────────────────────────────────────────────────

  /**
   * Obtém o catálogo completo via sitemap.xml (discovery de URLs de módulos/trails).
   * Cria entradas mínimas a partir dos slugs das URLs — menos rico mas 100% fiável.
   * Cache de 24h.
   */
  async getFullCatalog(forceRefresh = false): Promise<CourseResult[]> {
    if (!forceRefresh) {
      const cached = await this.cache.get(TRAILHEAD_CATALOG_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as CourseResult[];
        } catch {
          /* cache corrompido */
        }
      }
    }

    try {
      this.logger.log('[Trailhead] A obter catálogo via sitemap.xml...');
      const xmlPages = await this.fetchSitemapPages();
      const results = this.parseSitemapPages(xmlPages);

      if (results.length > 0) {
        await this.cache.set(
          TRAILHEAD_CATALOG_CACHE_KEY,
          JSON.stringify(results),
          CATALOG_CACHE_TTL,
        );
        this.logger.log(
          `[Trailhead] Catálogo por sitemap: ${results.length} itens (cache 24h).`,
        );
      }
      return results;
    } catch (err: unknown) {
      this.logger.error(
        `[Trailhead] Erro ao obter catálogo via sitemap: ${String(err)}`,
      );
      return [];
    }
  }

  /**
   * Obtém o XML do sitemap primário. Se for um sitemapindex, segue os sub-sitemaps
   * que contenham "modules", "trails" ou "superbadges" no URL.
   */
  private async fetchSitemapPages(): Promise<string[]> {
    const pages: string[] = [];

    for (const sitemapUrl of SITEMAP_URLS) {
      try {
        const response = await firstValueFrom(
          this.http
            .get<string>(sitemapUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LearningHubBot/1.0)',
                Accept: 'application/xml,text/xml,*/*',
              },
              responseType: 'text',
            })
            .pipe(timeout(30_000)),
        );
        const xml = response.data as string;

        // Verificar se é um sitemap index (contém <sitemapindex>)
        if (xml.includes('<sitemapindex')) {
          const subUrlRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
          let match: RegExpExecArray | null;
          const subFetches: Promise<void>[] = [];

          while ((match = subUrlRegex.exec(xml)) !== null) {
            const subUrl = match[1];
            // Só nos interessam sub-sitemaps com conteúdo de aprendizagem
            if (!/modules|trails|superbadge|learn/i.test(subUrl)) continue;

            subFetches.push(
              firstValueFrom(
                this.http
                  .get<string>(subUrl, {
                    headers: {
                      'User-Agent':
                        'Mozilla/5.0 (compatible; LearningHubBot/1.0)',
                      Accept: 'application/xml,text/xml,*/*',
                    },
                    responseType: 'text',
                  })
                  .pipe(timeout(30_000)),
              )
                .then((r) => {
                  pages.push(r.data as string);
                })
                .catch(() => {
                  /* ignorar falhas em sub-sitemaps individuais */
                }),
            );
          }

          await Promise.all(subFetches);
        } else {
          // urlset direto
          pages.push(xml);
        }

        if (pages.length > 0) break; // Primeiro sitemap URL que respondeu já chegou
      } catch {
        /* tentar próximo URL */
      }
    }

    return pages;
  }

  /**
   * Extrai CourseResult a partir de um array de XMLs de sitemap.
   * Título = slug da URL em Title Case.
   */
  private parseSitemapPages(xmlPages: string[]): CourseResult[] {
    const seen = new Set<string>();
    const results: CourseResult[] = [];

    for (const xml of xmlPages) {
      const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/g;
      let match: RegExpExecArray | null;

      while ((match = locRegex.exec(xml)) !== null) {
        const loc = match[1];

        let slug: string | undefined;
        let type: 'module' | 'trail' | 'superbadge' = 'module';

        for (const pattern of SITEMAP_PATH_PATTERNS) {
          const m = pattern.exec(loc);
          if (m) {
            slug = m[1];
            if (/trail/.test(pattern.source)) type = 'trail';
            else if (/superbadge/.test(pattern.source)) type = 'superbadge';
            break;
          }
        }

        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        const title = slug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const url = loc.startsWith('http') ? loc : `${BASE_URL}${loc}`;

        results.push({
          externalId: `trailhead:${slug.slice(0, 60)}`,
          title,
          description: `Trailhead ${type}: ${title}`,
          url,
          isFree: true,
          tags: [type],
          platformId: this.platform.id,
          platformName: this.platformName,
        });
      }
    }

    return results;
  }
}
