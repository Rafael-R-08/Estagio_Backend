import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

const MS_LEARN_SEARCH_URL =
  'https://learn.microsoft.com/api/search';

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

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

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // MS Learn é gratuito

    const apiUrl = MS_LEARN_SEARCH_URL;

    const response = await firstValueFrom(
      this.http
        .get(apiUrl, {
          params: {
            search: query,
            locale: 'en-us',
            $top: limit,
            facet: 'category',
          },
        })
        .pipe(timeout(15_000)),
    );

    const rawResults = (response.data as { results?: unknown[] })?.results ?? [];
    return rawResults.map((item) => this.normalize(item as Record<string, unknown>));
  }

  private normalize(item: Record<string, unknown>): CourseResult {
    const rawLevel = String((item.levels as string[])?.[0] ?? '').toLowerCase();
    const level = LEVEL_MAP[rawLevel];

    const tags: string[] = [
      ...((item.products as string[]) ?? []),
      ...((item.roles as string[]) ?? []),
    ];

    const url = String(item.url ?? item.displayUrl ?? '');
    const externalId = `mslearn:${this.urlToId(url)}`;
    const description = String(
      item.summary || item.body || item.description || '',
    );

    return {
      externalId,
      title: String(item.title ?? 'Sem título'),
      description,
      url,
      level,
      isFree: true,
      tags,
      platformId: this.platform.id,
      platformName: this.platformName,
    };
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
