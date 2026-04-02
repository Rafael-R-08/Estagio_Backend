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

const ALLOWED_CATEGORIES = new Set(['training', 'certification', 'applied skills', 'Training', 'Certification', 'Applied Skills']);

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

    // A API Microsoft Learn limita o `$top` para um máximo de 30 quando se utilizam filtros `$filter`.
    // Pedimos 30 para maximizar os resultados filtrados (em vez de pedir itens genéricos).
    const fetchTop = Math.min(Math.max(limit * 3, 20), 30);

    const rawResults = await this.searchRaw(query, fetchTop);
    let filtered = rawResults
      .filter((item) => {
        const entry = item as Record<string, unknown>;
        const category = String(entry.category ?? '').toLowerCase();
        const url = String(entry.url ?? entry.displayUrl ?? '').toLowerCase();

        return ALLOWED_CATEGORIES.has(category) || url.includes('/training/') || url.includes('/credentials/') || url.includes('/applied-skills/');
      })
      .map((item) => this.normalize(item as Record<string, unknown>));

    return filtered; // Retornamos todos os válidos encontrados na piscina de 100. slice(0, limit) era muito restritivo se pedirmos mais.
  }

  private async searchRaw(searchTerm: string, top: number): Promise<unknown[]> {
    const response = await firstValueFrom(
      this.http
        .get(MS_LEARN_SEARCH_URL, {
          params: {
            search: searchTerm,
            locale: 'en-us',
            $top: top,
            facet: 'category',
            // Filtro nativo da API Microsoft Learn capitalizado (Case-Sensitive) para garantir apenas cursos/certificações oficiais
            $filter: "category eq 'Training' or category eq 'Certification' or category eq 'Applied Skills'",
          },
        })
        .pipe(timeout(15_000)),
    );

    return (response.data as { results?: unknown[] })?.results ?? [];
  }

  private normalize(item: Record<string, unknown>): CourseResult {
    const url = String(item.url ?? item.displayUrl ?? '');
    const externalId = `mslearn:${this.urlToId(url)}`;
    
    const tags: string[] = [
      ...((item.products as string[]) ?? []),
      ...((item.roles as string[]) ?? []),
    ];

    const textForParsing = String(item.description || item.summary || '');
    
    // 1. Extração de Nível via structured fields ou regex no texto
    const rawLevel = String((item.levels as string[])?.[0] ?? '').toLowerCase();
    let level = LEVEL_MAP[rawLevel];

    if (!level) {
      level = this.extractLevelFromText(textForParsing);
    }

    // 2. Extração de Duração via regex no texto
    const durationHours = this.extractDurationFromText(textForParsing);

    // 3. Limpeza da descrição (remover metadados técnicos fixos)
    let description = textForParsing
      .replace(/At a glance.*(Skill|Product|Role|Subject).*\b/is, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (description.length > 300) {
      description = description.slice(0, 300) + '...';
    }

    return {
      externalId,
      title: String(item.title ?? 'Sem título'),
      description,
      url,
      instructor: String(item.author || item.creator || 'Microsoft Learn'),
      language: String(item.locale || 'en-us').split('-')[0],
      level,
      durationHours,
      isFree: true,
      tags,
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }

  private extractLevelFromText(text: string): CourseResult['level'] | undefined {
    // Regex ultra-robusto: (Termo de Nível)[:\s]+(Valor do Nível)
    const match = text.match(/(Level|Nível|Nivel|Dificuldade|Dificuldade)[:\s]+(Beginner|Intermediate|Advanced|Introductory|Expert|Iniciante|Intermédio|Avançado|Intermedio|Avancado|Fundamental)/i);
    
    if (!match) return undefined;
    
    const term = match[2].toLowerCase();
    const resolved = LEVEL_MAP[term];
    
    if (resolved) {
      this.logger.log(`[LEVEL_EXTRACTOR] Sucesso: "${match[0]}" -> "${resolved}"`);
    } else {
      this.logger.warn(`[LEVEL_EXTRACTOR] Encontrou "${term}" mas não soube mapear em LEVEL_MAP`);
    }
    
    return resolved;
  }

  private extractDurationFromText(text: string): number | undefined {
    // 1. Filtro para h e min (Ex: 3h 12m, 3 horas 12 minutos)
    const hMinMatch = text.match(/(\d+)\s*(h|hr|hrs|hora|horas)\s*(\d+)\s*(m|min|mins|minuto|minutos)/i);
    if (hMinMatch) {
      const hours = parseInt(hMinMatch[1]);
      const minutes = parseInt(hMinMatch[3]);
      return parseFloat((hours + minutes / 60).toFixed(2));
    }

    // 2. Filtro apenas para h (Ex: 1h, 2 horas)
    const hMatch = text.match(/(\d+)\s*(h|hr|hrs|hora|horas)\b/i);
    if (hMatch) return parseInt(hMatch[1]);

    // 3. Filtro apenas para min (Ex: 45 min, 45 minutos)
    const minMatch = text.match(/(\d+)\s*(m|min|mins|minuto|minutos|minute|minutes)/i);
    if (minMatch) {
      const minutes = parseInt(minMatch[1]);
      return parseFloat((minutes / 60).toFixed(2));
    }

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
