import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

/**
 * Udemy Adapter
 *
 * Estratégia de pesquisa (por ordem de prioridade):
 *  1. API REST pública  (/api-2.0/courses/?search=...) — sem autenticação, retorna JSON.
 *  2. Udemy Business API — se platform.config.mode='api' e apiKey estiver configurada.
 *  3. Scraping HTML    — apenas se platform.config.mode='scrape' (instável, Cloudflare).
 */

const UDEMY_SEARCH_BASE = 'https://www.udemy.com/courses/search/';
const UDEMY_BASE = 'https://www.udemy.com';

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  beginner: 'beginner',
  'all levels': 'beginner',
  introductory: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
  expert: 'advanced',
};

@Injectable()
export class UdemyAdapter extends BasePlatformAdapter {
  readonly platformName = 'Udemy';
  protected readonly logger = new Logger(UdemyAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, { id: 'udemy', name: 'Udemy', config: {} });
  }

  async fetchResults(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    this.logger.log(`[Udemy] Iniciando pesquisa: "${query}" (limit: ${limit})`);

    // Verificar se temos API Business configurada primeiro
    if (this.platform.config?.apiKey) {
      this.logger.log('[Udemy] Tentando Business API...');
      const apiResults = await this.fetchViaApi(query, limit, filters);
      if (apiResults.length > 0) return apiResults;
    }

    // Tentar API pública REST (mas provavelmente bloqueada)
    this.logger.log('[Udemy] Tentando API pública REST...');
    const publicResults = await this.fetchViaPublicApi(query, limit, filters);
    if (publicResults.length > 0) return publicResults;

    // Scraping como último recurso (também provavelmente bloqueado)
    this.logger.log('[Udemy] APIs falharam. Tentando scraping...');
    const scrapedResults = await this.fetchViaScraping(query, limit, filters);
    if (scrapedResults.length > 0) return scrapedResults;

    // Se nada funcionou, logar aviso sobre configuração necessária
    this.logger.warn(
      `[Udemy] Pesquisa falhou para "${query}". ` +
      `Configure API Business key em https://www.udemy.com/instructor/account/api/ ` +
      `ou a Udemy pode estar bloqueando acessos automatizados.`,
    );

    return [];
  }

  /** Scraping estratégia primária: JSON-LD → Redux state → HTML cards */
  private async fetchViaScraping(
    query: string,
    limit: number,
    filters?: { isFree?: boolean },
  ): Promise<CourseResult[]> {
    const params: Record<string, string> = {
      q: query,
      src: 'ukw',
      sort: 'relevance',
    };
    if (filters?.isFree === true) params['price'] = 'price-free';
    if (filters?.isFree === false) params['price'] = 'price-paid';

    const queryString = new URLSearchParams(params).toString();
    const url = `${UDEMY_SEARCH_BASE}?${queryString}`;

    let html: string;
    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
              'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Linux"',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1',
              'DNT': '1',
              'Connection': 'keep-alive',
            },
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );
      html = response.data;
    } catch (err: any) {
      if (err.response?.status === 403) {
        this.logger.warn(
          `[Udemy] Acesso à página de pesquisa bloqueado (403). ` +
            `A Udemy bloqueia frequentemente acessos automatizados sem API Business.`,
        );
      } else {
        this.logger.error(
          `[Udemy] Erro ao obter página de pesquisa: ${err.message}`,
        );
      }
      return [];
    }

    // Verificar se estamos sendo redirecionados para desafio Cloudflare
    if (html.includes('Just a moment') || html.includes('challenge-platform') || html.includes('cf-browser-verification')) {
      this.logger.warn(
        `[Udemy] Acesso bloqueado pelo Cloudflare. A Udemy está protegendo contra acessos automatizados.`,
      );
      return [];
    }

    // Estratégia A: JSON-LD (ItemList com cursos)
    const fromJsonLd = this.parseJsonLd(html);
    if (fromJsonLd.length > 0) {
      this.logger.debug(`[Udemy] JSON-LD: ${fromJsonLd.length} resultados`);
      return fromJsonLd.slice(0, limit);
    }

    // Estratégia B: Estado Redux injetado em window.__REDUX_INITIAL_STATE__
    const fromRedux = this.parseReduxState(html);
    if (fromRedux.length > 0) {
      this.logger.debug(`[Udemy] Redux state: ${fromRedux.length} resultados`);
      return fromRedux.slice(0, limit);
    }

    // Estratégia C: HTML cards via cheerio
    const fromHtml = this.parseHtmlCards(html);
    this.logger.debug(`[Udemy] HTML cards: ${fromHtml.length} resultados`);
    return fromHtml.slice(0, limit);
  }

  /** Extrai cursos do JSON-LD (application/ld+json com ItemList) */
  private parseJsonLd(html: string): CourseResult[] {
    const results: CourseResult[] = [];
    const $ = cheerio.load(html);

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? '{}');
        const root = Array.isArray(json) ? json : [json];

        for (const obj of root) {
          // ItemList com Course items
          if (
            obj['@type'] === 'ItemList' &&
            Array.isArray(obj.itemListElement)
          ) {
            for (const listItem of obj.itemListElement) {
              const item = listItem.item ?? listItem;
              if (!item?.name) continue;
              const r = this.normalizeLdItem(item);
              if (r) results.push(r);
            }
          }
          // Objeto Course / CourseInstance direto
          if (obj['@type'] === 'Course' && obj.name) {
            const r = this.normalizeLdItem(obj);
            if (r) results.push(r);
          }
        }
      } catch {
        /* JSON inválido — ignorar */
      }
    });

    return results;
  }

  private normalizeLdItem(item: Record<string, any>): CourseResult | null {
    const title = String(item.name ?? '').trim();
    if (!title) return null;

    const rawUrl = String(item.url ?? '');
    const url = rawUrl.startsWith('http')
      ? rawUrl
      : rawUrl
        ? `${UDEMY_BASE}${rawUrl}`
        : '';
    if (!url) return null;

    const slug = url.split('/').filter(Boolean).pop() ?? title;
    const externalId = `udemy:ld:${slug.slice(0, 80)}`;

    const instructor =
      (Array.isArray(item.author) ? item.author[0]?.name : item.author?.name) ??
      String(item.creator?.name ?? 'Udemy');

    const description = String(item.description ?? item.about ?? '').slice(
      0,
      400,
    );

    const rawLevel = String(
      item.educationalLevel ?? item.courseLevel ?? item.proficiencyLevel ?? '',
    ).toLowerCase();
    const level: CourseResult['level'] = LEVEL_MAP[rawLevel];

    const ratingValue =
      typeof item.aggregateRating?.ratingValue === 'number'
        ? item.aggregateRating.ratingValue
        : typeof item.aggregateRating?.ratingValue === 'string'
          ? parseFloat(item.aggregateRating.ratingValue)
          : undefined;

    const tags: string[] = [];
    if (item.about) {
      (Array.isArray(item.about) ? item.about : [item.about]).forEach(
        (a: any) => {
          if (a?.name) tags.push(String(a.name));
        },
      );
    }
    if (item.keywords) {
      const kws =
        typeof item.keywords === 'string'
          ? item.keywords.split(',')
          : (item.keywords as string[]);
      tags.push(
        ...kws
          .map((k: string) => k.trim())
          .filter(Boolean)
          .slice(0, 5),
      );
    }

    return {
      externalId,
      title,
      description,
      url,
      instructor,
      level,
      rating: ratingValue,
      isFree: item.isAccessibleForFree === true || item.offers?.price === 0,
      tags: [...new Set(tags)],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  /** Extrai cursos do estado Redux embutido no HTML */
  private parseReduxState(html: string): CourseResult[] {
    // Udemy injeta JSON em window.__REDUX_INITIAL_STATE__ ou UD.serverSideProps
    const patterns = [
      /window\.__REDUX_INITIAL_STATE__\s*=\s*(\{.+?\});\s*(?:window|<\/script>)/s,
      /window\.UD_GLOBAL_CONFIG\s*=\s*(\{.+?\});\s*(?:window|<\/script>)/s,
      /"results"\s*:\s*(\[.+?\])\s*,\s*"count"/s,
    ];

    for (const pattern of patterns) {
      try {
        const match = html.match(pattern);
        if (!match) continue;

        const parsed = JSON.parse(match[1]);

        // Tentar encontrar a lista de cursos no objeto Redux
        const courses = this.extractCoursesFromRedux(parsed);
        if (courses.length > 0) return courses;
      } catch {
        /* JSON inválido */
      }
    }
    return [];
  }

  private extractCoursesFromRedux(obj: any): CourseResult[] {
    if (!obj || typeof obj !== 'object') return [];

    // Procura recursiva por array de cursos com campo "title" e "url"
    if (Array.isArray(obj)) {
      if (obj.length > 0 && obj[0]?.title && obj[0]?.url) {
        return obj
          .filter((item: any) => item?.title && item?.url)
          .map((item: any) => this.normalizeReduxItem(item));
      }
      for (const child of obj.slice(0, 20)) {
        const found = this.extractCoursesFromRedux(child);
        if (found.length > 0) return found;
      }
    } else {
      for (const key of ['results', 'items', 'courses', 'data']) {
        if (obj[key]) {
          const found = this.extractCoursesFromRedux(obj[key]);
          if (found.length > 0) return found;
        }
      }
    }
    return [];
  }

  private normalizeReduxItem(item: any): CourseResult {
    const slug =
      item.url?.split('/').filter(Boolean).pop() ?? String(item.id ?? '');
    const url = item.url?.startsWith('http')
      ? item.url
      : `${UDEMY_BASE}${item.url}`;
    return {
      externalId: `udemy:redux:${slug.slice(0, 80)}`,
      title: String(item.title ?? 'Curso Udemy'),
      description: String(item.headline ?? item.description ?? '').slice(
        0,
        400,
      ),
      url,
      instructor: String(
        item.visible_instructors?.[0]?.title ?? item.instructor_name ?? 'Udemy',
      ),
      rating: typeof item.rating === 'number' ? item.rating : undefined,
      isFree: typeof item.is_paid === 'boolean' ? !item.is_paid : undefined,
      tags: [],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  /** Fallback: parse de cards HTML com cheerio */
  private parseHtmlCards(html: string): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // Seletores de cards Udemy (podem mudar com redesigns — multi-selector para resiliência)
    const cardSelectors = [
      '[data-testid="course-card"]',
      '.course-card--container',
      '.popper--popper--fVkKM',
      'div[class*="course-card"]',
      'div[class*="CourseCard"]',
    ];

    for (const selector of cardSelectors) {
      if ($(selector).length === 0) continue;

      $(selector).each((_, el) => {
        const card = $(el);

        const titleEl = card
          .find(
            'h3, [data-testid="course-card-title"], [class*="title"], [class*="Title"]',
          )
          .first();
        const title = titleEl.text().trim();
        if (!title || seen.has(title)) return;

        const linkEl = card.find('a[href*="/course/"]').first();
        const href = linkEl.attr('href') ?? '';
        if (!href) return;

        const url = href.startsWith('http') ? href : `${UDEMY_BASE}${href}`;
        seen.add(title);

        const description = card
          .find(
            '[data-testid="course-card-description"], p, [class*="headline"], [class*="description"]',
          )
          .first()
          .text()
          .trim()
          .slice(0, 400);

        const ratingText = card
          .find(
            '[data-testid="course-card-rating"], [class*="rating"], [class*="Rating"]',
          )
          .first()
          .text()
          .trim();
        const rating = parseFloat(ratingText) || undefined;

        const slug = url.split('/').filter(Boolean).pop() ?? title;

        results.push({
          externalId: `udemy:html:${slug.slice(0, 80)}`,
          title,
          description,
          url,
          instructor: 'Udemy',
          rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
          tags: [],
          platformId: this.platform.id,
          platformName: this.platformName,
        });
      });

      if (results.length > 0) break; // Se um selector funcionou não precisamos tentar os outros
    }

    return results;
  }

  /**
   * API pública REST da Udemy — sem autenticação.
   * Endpoint: https://www.udemy.com/api-2.0/courses/?search=...
   * Funciona para pesquisas básicas sem credenciais.
   */
  private async fetchViaPublicApi(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number },
  ): Promise<CourseResult[]> {
    const isSimple = (filters as any)?._simple === true;
    const url = 'https://www.udemy.com/api-2.0/courses/';
    const params: Record<string, any> = {
      search: query,
      page_size: Math.min(limit, 20),
    };

    if (!isSimple) {
      params['language'] = 'en';
      params['fields[course]'] =
        'id,title,headline,url,visible_instructors,is_paid,price,rating,num_reviews,instructional_level,primary_category,primary_subcategory,image_240x135';
    }

    if (filters?.isFree === true) params['price'] = 'price-free';
    if (filters?.isFree === false) params['price'] = 'price-paid';
    if (filters?.minRating) params['ratings'] = filters.minRating;

    try {
      const response = await firstValueFrom(
        this.http
          .get(url, {
            headers: {
              Accept: 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
              'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Referer: 'https://www.udemy.com/',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
            },
            params,
          })
          .pipe(timeout(10_000)),
      );

      const rawResults =
        (response.data as { results?: unknown[] })?.results ?? [];
      this.logger.log(
        `[Udemy] API pública (${isSimple ? 'simples' : 'completa'}): ${rawResults.length} resultados`,
      );
      return rawResults.map((item) =>
        this.normalizeApiItem(item as Record<string, unknown>),
      );
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 403) {
        this.logger.warn(
          `[Udemy] API pública bloqueada (403). A Udemy mudou sua política e agora requer autenticação Business API.`,
        );
      } else {
        this.logger.warn(`[Udemy] API pública falhou (${status}): ${err.message}`);
      }
      return [];
    }
  }

  /** API REST Udemy Business (requer apiKey em Base64 client_id:client_secret)
   *
   * Para configurar:
   * 1. Acesse https://www.udemy.com/instructor/account/api/
   * 2. Crie uma aplicação para obter client_id e client_secret
   * 3. Codifique em Base64: btoa('client_id:client_secret')
   * 4. Configure apiKey no admin panel da plataforma Udemy
   */
  private async fetchViaApi(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number },
  ): Promise<CourseResult[]> {
    const authHeader = `Basic ${this.platform.config.apiKey}`;
    const url =
      this.platform.apiEndpoint || 'https://www.udemy.com/api-2.0/courses/';

    try {
      const params: Record<string, any> = {
        search: query,
        page_size: limit,
        'fields[course]':
          'id,title,headline,url,visible_instructors,is_paid,price,rating,num_reviews,instructional_level,primary_category,primary_subcategory',
      };
      if (filters?.isFree !== undefined)
        params['price'] = filters.isFree ? 'price-free' : 'price-paid';

      const response = await firstValueFrom(
        this.http
          .get(url, {
            headers: { Authorization: authHeader, Accept: 'application/json' },
            params,
          })
          .pipe(timeout(15_000)),
      );

      const rawResults =
        (response.data as { results?: unknown[] })?.results ?? [];
      return rawResults.map((item) =>
        this.normalizeApiItem(item as Record<string, unknown>),
      );
    } catch (err: any) {
      this.logger.warn(`[Udemy] API Business falhou (${err.message}).`);
      return [];
    }
  }

  private normalizeApiItem(item: Record<string, unknown>): CourseResult {
    const baseUrl = UDEMY_BASE;
    const relativeUrl = String(item.url ?? '');
    const finalUrl = relativeUrl.startsWith('http')
      ? relativeUrl
      : `${baseUrl}${relativeUrl}`;
    const externalId = `udemy:api:${String(item.id ?? relativeUrl.split('/').pop())}`;

    const instructors = Array.isArray(item.visible_instructors) ? item.visible_instructors : [];
    const instructor = instructors.length > 0 
      ? (instructors[0].display_name || instructors[0].title || 'Udemy')
      : String(item.instructor_name || 'Udemy');

    const tags: string[] = [];
    if (item.primary_category) {
      const cat = item.primary_category as any;
      tags.push(cat.title || String(cat));
    }
    if (item.primary_subcategory) {
      const sub = item.primary_subcategory as any;
      tags.push(sub.title || String(sub));
    }

    const rawLevel = String(item.instructional_level ?? '').toLowerCase();
    const level = LEVEL_MAP[rawLevel];

    return {
      externalId,
      title: String(item.title ?? 'Curso Udemy'),
      description: String(item.headline ?? '').slice(0, 400),
      url: finalUrl,
      instructor,
      level,
      rating: typeof item.rating === 'number' ? item.rating : undefined,
      isFree: typeof item.is_paid === 'boolean' ? !item.is_paid : undefined,
      tags: [...new Set(tags)],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }
}
