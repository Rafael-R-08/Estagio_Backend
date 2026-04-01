import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type {
  CourseResult,
} from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://skillsbuild.org';
const CATALOG_URL = `${BASE_URL}/learn`;

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

  async fetchResults(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // IBM SkillsBuild é gratuito

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
    const catalogUrl = this.platform.apiEndpoint || CATALOG_URL;
    
    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(catalogUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );

      return this.parseHtml(response.data);
    } catch (error: unknown) {
      this.logger.error(`[IBM SkillsBuild] Erro HTTP ao obter catálogo: ${String(error)}`);
      return [];
    }
  }

  private parseHtml(html: string): CourseResult[] {
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // Extrair links de cursos
    const urlMap = new Map<string, string>();
    const linkRegex = /href=["']((?:https?:\/\/skillsbuild\.org)?\/(?:learn\/digital-credentials\/[^"'\s]+|courses\/[^"'\s]+|course\/[^"'\s]+))['"]/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const key = url.split('/').filter(Boolean).pop() ?? url;
      urlMap.set(key, url);
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();

    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const json = JSON.parse(match[1]);
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (!item.name || seen.has(item.name)) continue;
          if (!['Course', 'LearningResource', 'EducationalOccupationalCredential'].includes(item['@type'])) continue;

          seen.add(item.name);
          const rawUrl = String(item.url ?? '');
          const url = rawUrl.startsWith('http') ? rawUrl : rawUrl ? `${BASE_URL}${rawUrl}` : CATALOG_URL;
          const slug = url.split('/').filter(Boolean).pop() ?? item.name;

          results.push(this.buildResult(
            `ibm:${slug.slice(0, 60)}`,
            String(item.name),
            String(item.description ?? ''),
            url,
            item.educationalLevel ?? '',
            (item.teaches ?? item.keywords ?? []) as string[],
            item.timeRequired,
          ));
        }
      } catch { }
    }

    if (results.length === 0) {
      const metaRegex = /(Beginner|Intermediate|Advanced|Getting started|Foundations|Professional)\s*[·|]\s*(\d+)\s*(hour|hr|min)/gi;
      let match: RegExpExecArray | null;

      while ((match = metaRegex.exec(text)) !== null) {
        const levelRaw = match[1].toLowerCase();
        const qty = parseInt(match[2], 10);
        const unit = match[3].toLowerCase();
        const durationHours = unit.startsWith('min') ? parseFloat((qty / 60).toFixed(2)) : qty;
        const metaIndex = match.index;

        const before = text.slice(Math.max(0, metaIndex - 400), metaIndex);
        const lines = before.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length === 0) continue;

        let title = '';
        for (let i = lines.length - 1; i >= 0; i--) {
          const l = lines[i];
          if (l.length >= 5 && l.length <= 150 && !/explore|see all|filter|login|sign/i.test(l)) {
            title = l;
            break;
          }
        }
        if (!title || seen.has(title)) continue;
        seen.add(title);

        const slugKey = title.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
        const courseUrl = [...urlMap.entries()].find(([k]) => k.includes(slugKey.slice(0, 10)))?.[1] ?? CATALOG_URL;

        const after = text.slice(metaIndex, metaIndex + 400);
        const descLines = after.split('\n').map((l) => l.trim()).filter((l) => l.length > 20 && l.length < 300);

        results.push(this.buildResult(
          `ibm:${slugKey.slice(0, 60)}`,
          title,
          descLines[0] ?? '',
          courseUrl,
          levelRaw,
          [],
          `PT${durationHours}H`,
        ));
      }
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
      (normalizedLevel.includes('begin') ? 'beginner' :
        normalizedLevel.includes('advan') ? 'advanced' :
          normalizedLevel.includes('inter') ? 'intermediate' : undefined);

    let durationHours: number | undefined;
    if (timeRequired) {
      const hoursMatch = String(timeRequired).match(/(\d+)H/i);
      const minsMatch = String(timeRequired).match(/(\d+)M/i);
      if (hoursMatch || minsMatch) {
        durationHours = parseFloat(
          ((Number(hoursMatch?.[1] ?? 0)) + (Number(minsMatch?.[1] ?? 0) / 60)).toFixed(2),
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
