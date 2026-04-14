import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://skillsbuild.org';
/**
 * Catálogo por categorias — a antiga URL /learn retorna 404.
 * Percorremos as categorias principais de /students/course-catalog.
 */
const CATALOG_BASE = `${BASE_URL}/students/course-catalog`;

/** Categorias de interesse para colaboradores Softinsa */
const CATALOG_CATEGORIES = [
  'artificial-intelligence',
  'cloud-computing',
  'cybersecurity',
  'data-science',
  'enterprise-computing',
  'web-development',
  'it-support',
  'quantum-computing',
  'professional-skills',
  'agile',
] as const;

/** Cache do catálogo IBM: 12 horas */
const CATALOG_CACHE_TTL = 43200;
const IBM_CATALOG_CACHE_KEY = 'ibm_skillsbuild:catalog:v2';

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
  'getting started': 'beginner',
  foundations: 'beginner',
  professional: 'advanced',
};

@Injectable()
export class IbmSkillsBuildAdapter extends BasePlatformAdapter {
  readonly platformName = 'IBM SkillsBuild';
  protected readonly logger = new Logger(IbmSkillsBuildAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, { id: 'ibm', name: 'IBM SkillsBuild', config: {} });
  }

  async fetchResults(
    query: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number },
  ): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // IBM SkillsBuild é sempre gratuito

    const allCourses = await this.getAllCourses();
    if (allCourses.length === 0) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return allCourses
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
      .map(({ _score: _, ...rest }) => rest);
  }

  /**
   * Obtém o catálogo percorrendo as categorias de /students/course-catalog.
   * Cache de 12h. Se forceRefresh=true, ignora cache.
   */
  async getAllCourses(forceRefresh = false): Promise<CourseResult[]> {
    if (!forceRefresh) {
      const cached = await this.cache.get(IBM_CATALOG_CACHE_KEY);
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

    // Se apiEndpoint estiver configurado na DB, usado como única fonte
    const customEndpoint = this.platform.apiEndpoint;
    const categories = customEndpoint
      ? [customEndpoint]
      : CATALOG_CATEGORIES.map((c) => `${CATALOG_BASE}/${c}`);

    for (const url of categories) {
      try {
        const response = await firstValueFrom(
          this.http
            .get<string>(url, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
              },
              responseType: 'text',
            })
            .pipe(timeout(15_000)),
        );
        const pageResults = this.parseHtml(response.data as string, seen);
        allResults.push(...pageResults);
      } catch (error: unknown) {
        this.logger.warn(
          `[IBM SkillsBuild] Erro ao obter categoria ${url}: ${String(error)}`,
        );
      }
    }

    if (allResults.length > 0) {
      await this.cache.set(
        IBM_CATALOG_CACHE_KEY,
        JSON.stringify(allResults),
        CATALOG_CACHE_TTL,
      );
      this.logger.log(
        `[IBM SkillsBuild] Catálogo carregado: ${allResults.length} itens de ${categories.length} categorias (cache 12h).`,
      );
    } else {
      this.logger.warn('[IBM SkillsBuild] Nenhum curso encontrado em nenhuma categoria.');
    }
    return allResults;
  }

  private parseHtml(html: string, seen: Set<string> = new Set()): CourseResult[] {
    const results: CourseResult[] = [];

    // Estratégia A: Cards com selector atualizado para nova estrutura skillsbuild.org (2025+)
    const fromCards = this.parseCards(html, seen);
    results.push(...fromCards);

    // Estratégia B: JSON-LD (legacy)
    if (results.length < 5) {
      const fromJsonLd = this.parseJsonLd(html, seen);
      results.push(...fromJsonLd);
    }

    // Estratégia C: Regex de metadados (último recurso)
    if (results.length === 0) {
      const fromRegex = this.parseMetaRegex(html, seen);
      results.push(...fromRegex);
    }

    return results;
  }

  /** Estratégia A: JSON-LD */
  private parseJsonLd(html: string, seen: Set<string>): CourseResult[] {
    const results: CourseResult[] = [];
    const $ = cheerio.load(html);

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() ?? '{}');
        const items = Array.isArray(json) ? json : [json];

        for (const item of items) {
          // ItemList
          if (
            item['@type'] === 'ItemList' &&
            Array.isArray(item.itemListElement)
          ) {
            for (const listItem of item.itemListElement) {
              const course = listItem.item ?? listItem;
              const r = this.normalizeLdItem(course, seen);
              if (r) results.push(r);
            }
            continue;
          }
          // Course / LearningResource / EducationalOccupationalCredential
          const validTypes = [
            'Course',
            'LearningResource',
            'EducationalOccupationalCredential',
          ];
          if (validTypes.includes(item['@type']) && item.name) {
            const r = this.normalizeLdItem(item, seen);
            if (r) results.push(r);
          }
        }
      } catch {
        /* JSON inválido */
      }
    });

    return results;
  }

  private normalizeLdItem(
    item: Record<string, any>,
    seen: Set<string>,
  ): CourseResult | null {
    const title = String(item.name ?? '').trim();
    if (!title || seen.has(title)) return null;
    seen.add(title);

    const rawUrl = String(item.url ?? '');
    const url = rawUrl.startsWith('http')
      ? rawUrl
      : rawUrl
        ? `${BASE_URL}${rawUrl}`
        : CATALOG_BASE;
    const slug = url.split('/').filter(Boolean).pop() ?? title;

    const tags: string[] = [];
    if (item.teaches)
      (Array.isArray(item.teaches) ? item.teaches : [item.teaches]).forEach(
        (t: any) => tags.push(String(t)),
      );
    if (item.keywords) {
      const kws =
        typeof item.keywords === 'string'
          ? item.keywords.split(',')
          : (item.keywords as string[]);
      tags.push(...kws.map((k: string) => k.trim()).filter(Boolean));
    }

    return this.buildResult(
      `ibm:${slug.slice(0, 60)}`,
      title,
      String(item.description ?? ''),
      url,
      String(item.educationalLevel ?? ''),
      tags,
      item.timeRequired,
    );
  }

  /** Estratégia B: Cards HTML via cheerio — suporta layout sb-card (2025+) e layouts antigos */
  private parseCards(html: string, seen: Set<string>): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];

    // Novo layout 2025+: <a href="https://students.yourlearning.ibm.com/..." class="sb-card ...">
    // O anchor engloba o card inteiro → usar o próprio <a> como container
    $('a[href*="yourlearning.ibm.com"]').each((_, el) => {
      const anchor = $(el);
      const href = anchor.attr('href') ?? '';
      if (!href) return;

      const title = anchor.find('h2, h3, h4, strong').first().text().trim()
        || anchor.attr('aria-label')?.trim()
        || '';
      if (!title || title.length < 4 || seen.has(title)) return;

      seen.add(title);
      const description = anchor.find('p').first().text().trim();

      const metaText = anchor.text().toLowerCase();
      const levelMatch = metaText.match(
        /\b(beginner|intermediate|advanced|getting started|foundations|professional)\b/,
      );
      const levelRaw = levelMatch?.[1] ?? '';

      const durationMatch = metaText.match(/(\d+)\s*(hour|hr|min)/);
      let durationHours: number | undefined;
      if (durationMatch) {
        const qty = parseInt(durationMatch[1], 10);
        durationHours = durationMatch[2].startsWith('min')
          ? parseFloat((qty / 60).toFixed(2))
          : qty;
      }

      const slug = href.split('/').filter(Boolean).pop()?.split('?')[0]
        ?? title.toLowerCase().replace(/\s+/g, '-');
      results.push(
        this.buildResult(
          `ibm:card:${slug.slice(0, 60)}`,
          title,
          description,
          href,
          levelRaw,
          [],
          durationHours != null ? `PT${durationHours}H` : undefined,
        ),
      );
    });

    if (results.length > 0) return results;

    // Fallback layouts antigos
    const fallbackSelectors = [
      '[class*="course-card"]',
      '[class*="CourseCard"]',
      'article',
      '.learning-resource',
      '[data-testid*="course"]',
    ];

    for (const selector of fallbackSelectors) {
      if ($(selector).length < 3) continue;

      $(selector).each((_, el) => {
        const card = $(el);

        const titleEl = card
          .find('h2, h3, h4, [class*="title"], [class*="Title"]')
          .first();
        const title = titleEl.text().trim();
        if (!title || title.length < 4 || seen.has(title)) return;

        const href =
          card.find('a[href*="yourlearning.ibm.com"], a[href*="/course"], a[href*="/learn/"]').first().attr('href')
          ?? card.find('a').first().attr('href')
          ?? '';
        const url = href
          ? href.startsWith('http') ? href : `${BASE_URL}${href}`
          : CATALOG_BASE;

        seen.add(title);
        const description = card.find('p').first().text().trim();

        const metaText = card.text().toLowerCase();
        const levelMatch = metaText.match(
          /\b(beginner|intermediate|advanced|getting started|foundations|professional)\b/,
        );
        const levelRaw = levelMatch?.[1] ?? '';

        const slug = url.split('/').filter(Boolean).pop()?.split('?')[0]
          ?? title.toLowerCase().replace(/\s+/g, '-');
        results.push(
          this.buildResult(`ibm:card:${slug.slice(0, 60)}`, title, description, url, levelRaw, []),
        );
      });

      if (results.length >= 5) break;
    }

    return results;
  }

  /** Estratégia C: Regex de metadados no texto limpo */
  private parseMetaRegex(html: string, seen: Set<string>): CourseResult[] {
    const results: CourseResult[] = [];

    // Construir mapa URL → slug para correlacionar título com link
    const urlMap = new Map<string, string>();
    const linkRegex =
      /href=["']((?:https?:\/\/skillsbuild\.org)?\/(?:learn\/digital-credentials\/[^"'\s]+|courses?\/[^"'\s]+))['"]/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const key = url.split('/').filter(Boolean).pop() ?? '';
      if (key) urlMap.set(key, url);
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();

    const metaRegex =
      /(Beginner|Intermediate|Advanced|Getting started|Foundations|Professional)\s*[·|]\s*(\d+)\s*(hour|hr|min)/gi;
    let match: RegExpExecArray | null;

    while ((match = metaRegex.exec(text)) !== null) {
      const levelRaw = match[1].toLowerCase();
      const qty = parseInt(match[2], 10);
      const unit = match[3].toLowerCase();
      const durationHours = unit.startsWith('min')
        ? parseFloat((qty / 60).toFixed(2))
        : qty;
      const metaIndex = match.index;

      const before = text.slice(Math.max(0, metaIndex - 400), metaIndex);
      const lines = before
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) continue;

      let title = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (
          l.length >= 5 &&
          l.length <= 150 &&
          !/explore|see all|filter|login|sign/i.test(l)
        ) {
          title = l;
          break;
        }
      }
      if (!title || seen.has(title)) continue;
      seen.add(title);

      const slugKey = title.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
      const courseUrl =
        [...urlMap.entries()].find(([k]) =>
          k.includes(slugKey.slice(0, 10)),
        )?.[1] ?? `${CATALOG_BASE}/artificial-intelligence`;

      const after = text.slice(metaIndex, metaIndex + 400);
      const descLines = after
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 20 && l.length < 300);

      results.push(
        this.buildResult(
          `ibm:regex:${slugKey.slice(0, 60)}`,
          title,
          descLines[0] ?? '',
          courseUrl,
          levelRaw,
          [],
          `PT${durationHours}H`,
        ),
      );
    }

    return results;
  }

  private buildResult(
    externalId: string,
    title: string,
    description: string,
    url: string,
    levelRaw: string,
    tags: string[],
    timeRequired?: string,
  ): CourseResult {
    const normalizedLevel = levelRaw.toLowerCase().trim();
    const level: CourseResult['level'] =
      LEVEL_MAP[normalizedLevel] ??
      (normalizedLevel.includes('begin')
        ? 'beginner'
        : normalizedLevel.includes('advan')
          ? 'advanced'
          : normalizedLevel.includes('inter')
            ? 'intermediate'
            : undefined);

    let durationHours: number | undefined;
    if (timeRequired) {
      const hoursMatch = String(timeRequired).match(/(\d+)H/i);
      const minsMatch = String(timeRequired).match(/(\d+)M/i);
      if (hoursMatch || minsMatch) {
        durationHours = parseFloat(
          (
            Number(hoursMatch?.[1] ?? 0) +
            Number(minsMatch?.[1] ?? 0) / 60
          ).toFixed(2),
        );
      }
    }

    return {
      externalId,
      title,
      description: description.slice(0, 500),
      url,
      level,
      durationHours: durationHours || undefined,
      isFree: true,
      tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }
}
