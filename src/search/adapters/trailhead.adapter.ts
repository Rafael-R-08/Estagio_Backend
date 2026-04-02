import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

const SEARCH_URL = 'https://trailhead.salesforce.com/en/search';
const BASE_URL = 'https://trailhead.salesforce.com';

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

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // Trailhead é gratuito

    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(SEARCH_URL, {
            params: { keywords: query },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
            },
            responseType: 'text',
          })
          .pipe(timeout(15_000)),
      );

      return this.parseHtml(response.data).slice(0, limit);
    } catch (error: unknown) {
      this.logger.error(`[Trailhead] Erro ao pesquisar: ${String(error)}`);
      return [];
    }
  }

  private parseHtml(html: string): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // Trailhead search results are often inside cards
    $('.th-card, [data-testid="search-result-card"], article').each((_, el) => {
      const card = $(el);
      const titleEl = card.find('h3, [data-testid="card-title"], .th-card__title, a').first();
      const title = titleEl.text().trim();
      
      if (!title || seen.has(title)) return;
      
      const link = card.find('a[href*="/content/learn/"]').attr('href');
      if (!link) return;

      const url = link.startsWith('http') ? link : `${BASE_URL}${link}`;
      if (!url.includes('/content/learn/')) return;
      const description = card.find('.th-card__description, [data-testid="card-description"], p').text().trim();
      
      const meta = card.text().toLowerCase();
      
      const level: CourseResult['level'] = 
        meta.includes('beginner') ? 'beginner' :
        meta.includes('intermediate') ? 'intermediate' :
        meta.includes('advanced') ? 'advanced' : undefined;

      const timeMatch = meta.match(/(\d+)\s*(mins?|hrs?|hours?)/);
      let durationHours: number | undefined = undefined;
      if (timeMatch) {
        const val = parseInt(timeMatch[1], 10);
        const unit = timeMatch[2];
        durationHours = unit.startsWith('m') ? val / 60 : val;
      }

      const tags: string[] = [];
      card.find('.th-card__tags span, [data-testid="card-tag"], .badge').each((_, tagEl) => {
        const tag = $(tagEl).text().trim();
        if (tag) tags.push(tag);
      });

      const slug = url.split('/').filter(Boolean).pop() ?? title.toLowerCase().replace(/\s+/g, '-');

      seen.add(title);
      results.push({
        externalId: `trailhead:${slug.slice(0, 60)}`,
        title,
        description: description.slice(0, 500),
        url,
        level,
        durationHours: durationHours ? parseFloat(durationHours.toFixed(2)) : undefined,
        isFree: true,
        tags,
        platformId: this.platform.id,
        platformName: this.platformName,
      });
    });

    // Strategy fallback: JSON-LD
    if (results.length === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || '{}');
          const items = json.itemListElement || (json['@type'] === 'ItemList' ? json.itemListElement : []);
          
          for (const listItem of items) {
            const item = listItem.item || listItem;
            if (item && item.name && !seen.has(item.name)) {
              const rawUrl = String(item.url || '');
              const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${BASE_URL}${rawUrl}`;
              if (!fullUrl.includes('/content/learn/')) continue;

              seen.add(item.name);
              results.push({
                externalId: `trailhead:${(rawUrl || '').split('/').pop() || item.name}`,
                title: item.name,
                description: item.description || '',
                url: fullUrl,
                isFree: true,
                tags: [],
                platformId: this.platform.id,
                platformName: this.platformName,
              });
            }
          }
        } catch { }
      });
    }

    return results;
  }
}
