import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://academiaportugaldigital.pt';
const COURSES_URL = `${BASE_URL}/cursos`;

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  iniciado: 'beginner',
  'intermédio': 'intermediate',
  'avançado': 'advanced',
  intermediate: 'intermediate',
  advanced: 'advanced',
  beginner: 'beginner',
};

@Injectable()
export class AcademiaPortugalDigitalAdapter extends BasePlatformAdapter {
  readonly platformName = 'Academia Portugal Digital';
  protected readonly logger = new Logger(AcademiaPortugalDigitalAdapter.name);

  constructor(
    private readonly http: HttpService,
    cache: CacheService,
  ) {
    super(cache, { id: 'academiapt', name: 'Academia Portugal Digital', config: {} });
  }

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // Academia PT é gratuito

    const allCourses = await this.getAllCourses();
    if (allCourses.length === 0) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    return allCourses
      .map((c) => {
        const haystack = `${c.title} ${c.description} ${c.tags.join(' ')}`.toLowerCase();
        const matchCount = terms.filter((t) => haystack.includes(t)).length;
        return { ...c, _score: matchCount };
      })
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score: _, ...rest }) => rest);
  }

  private async getAllCourses(): Promise<CourseResult[]> {
    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(COURSES_URL, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
            },
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );

      return this.parseHtml(response.data);
    } catch (error: unknown) {
      this.logger.error(`[Academia PT Digital] Erro ao obter cursos: ${String(error)}`);
      return [];
    }
  }

  private parseHtml(html: string): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // No site da Academia Portugal Digital, os cursos geralmente estão em cards
    // O seletor exato pode variar, mas tentamos um padrão comum de cards/links
    $('.views-row, .course-card, article').each((_, el) => {
      const card = $(el);
      const titleEl = card.find('h3, .title, a[href*="/formacao/"]').first();
      const title = titleEl.text().trim();
      
      if (!title || seen.has(title)) return;
      
      const link = titleEl.attr('href') || card.find('a[href*="/formacao/"]').attr('href');
      if (!link) return;

      const url = link.startsWith('http') ? link : `${BASE_URL}${link}`;
      const description = card.find('.description, .summary, p').first().text().trim();
      
      // Metadata: "Iniciado | 3h 0m | Português"
      const metaText = card.text();
      const metaMatch = metaText.match(/(Iniciado|Intermédio|Avançado)\s*\|\s*(\d+)h\s*(\d+)m?\s*\|\s*(\w+)/i);
      
      let level: CourseResult['level'] = undefined;
      let durationHours: number | undefined = undefined;

      if (metaMatch) {
         level = LEVEL_MAP[metaMatch[1].toLowerCase()];
         const h = parseInt(metaMatch[2], 10);
         const m = parseInt(metaMatch[3], 10);
         durationHours = h + (m / 60);
      }

      const titleSlug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      seen.add(title);
      results.push({
        externalId: `academiapt:${titleSlug.slice(0, 60)}`,
        title,
        description: description.slice(0, 400),
        url,
        level,
        durationHours: durationHours ? parseFloat(durationHours.toFixed(2)) : undefined,
        isFree: true,
        tags: [],
        platformId: this.platform.id,
        platformName: this.platformName,
      });
    });

    return results;
  }
}
