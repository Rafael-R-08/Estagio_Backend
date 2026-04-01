import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

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

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    // A API Key será lida do this.platform.config.apiKey que pode ser atualizado dinamicamente
    if (!this.platform.config.apiKey) {
      this.logger.warn(`[Udemy] apiKey não configurada. Ignorando pesquisa.`);
      return [];
    }

    const authHeader = `Basic ${this.platform.config.apiKey}`;
    const url = this.platform.apiEndpoint || 'https://www.udemy.com/api-2.0/courses/';

    const params: any = {
      search: query,
      page_size: limit,
      'fields[course]': 'title,headline,url,image_480x270,instructor_name,visible_instructors,is_paid,rating,primary_category,primary_subcategory',
    };

    if (filters?.isFree !== undefined) {
      params.price = filters.isFree ? 'price-free' : 'price-paid';
    }
    if (filters?.minRating !== undefined) {
      params.ratings = filters.minRating >= 4.5 ? '4.5' : filters.minRating >= 4.0 ? '4.0' : filters.minRating >= 3.0 ? '3.0' : undefined;
    }

    const response = await firstValueFrom(
      this.http
        .get(url, {
          headers: {
            Authorization: authHeader,
            Accept: 'application/json, text/plain, */*',
          },
          params,
        })
        .pipe(timeout(15_000)),
    );

    const rawResults = (response.data as { results?: unknown[] })?.results ?? [];
    return rawResults.map((item) => this.normalize(item as Record<string, unknown>));
  }

  private normalize(item: Record<string, unknown>): CourseResult {
    const baseUrl = 'https://www.udemy.com';
    const relativeUrl = String(item.url ?? '');
    const finalUrl = relativeUrl.startsWith('http') ? relativeUrl : `${baseUrl}${relativeUrl}`;
    const externalId = `udemy:${String(item.id)}`;

    const instructors = item.visible_instructors as Array<{title?: string}> | undefined;
    const instructorName = instructors?.[0]?.title ?? String(item.instructor_name ?? 'Instructor Udemy');

    // Tags extraídas da categoria e subcategoria
    const tags: string[] = [];
    if (item.primary_category) tags.push((item.primary_category as any).title || String(item.primary_category));
    if (item.primary_subcategory) tags.push((item.primary_subcategory as any).title || String(item.primary_subcategory));

    return {
      externalId,
      title: String(item.title ?? 'Curso Udemy'),
      description: String(item.headline ?? ''),
      url: finalUrl,
      instructor: instructorName,
      rating: typeof item.rating === 'number' ? item.rating : undefined,
      isFree: typeof item.is_paid === 'boolean' ? !item.is_paid : undefined,
      tags: [...new Set(tags)], 
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  /**
   * Permite atualizar a config (ex: apiKey) após a injeção
   */
  updateConfig(config: Record<string, any>) {
    this.platform.config = { ...this.platform.config, ...config };
  }
}
