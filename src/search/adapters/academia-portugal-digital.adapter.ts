import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import * as cheerio from 'cheerio';
import { BasePlatformAdapter } from './base-platform.adapter';
import { CacheService } from '../../cache/cache.service';
import type { CourseResult } from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://academiaportugaldigital.pt';
/**
 * A página /cursos carrega os cursos via AJAX para /cursos-pesquisa.
 * Usamos diretamente o endpoint AJAX para obter o HTML dos cards.
 */
const COURSES_AJAX_URL = `${BASE_URL}/cursos-pesquisa`;

/** Cache do catálogo: 12 horas */
const CATALOG_CACHE_TTL = 43200;
const ACADEMIA_CATALOG_CACHE_KEY = 'academia_pt:catalog:v3';

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
  /** Necessário para que o servidor retorne o fragmento HTML dos cursos */
  'X-Requested-With': 'XMLHttpRequest',
  Referer: `${BASE_URL}/cursos`,
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

  /**
   * Obtém todos os cursos via endpoint AJAX /cursos-pesquisa (cache 12h).
   * A página /cursos carrega os cursos dinamicamente a partir deste endpoint.
   * Se forceRefresh=true, ignora cache.
   */
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

    const ajaxUrl = this.platform.apiEndpoint || COURSES_AJAX_URL;
    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(ajaxUrl, {
            params: {
              textSearch: '',
              areaId: '',
              competenceLevelId: '',
              duration: '',
              language: '',
              partner: '',
              isRecommended: '',
            },
            headers: REQUEST_HEADERS,
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );

      const seen = new Set<string>();
      const results = this.parseHtml(response.data as string, seen);

      if (results.length > 0) {
        await this.cache.set(
          ACADEMIA_CATALOG_CACHE_KEY,
          JSON.stringify(results),
          CATALOG_CACHE_TTL,
        );
        this.logger.log(
          `[Academia PT Digital] Catálogo carregado: ${results.length} cursos (cache 12h).`,
        );
      } else {
        this.logger.warn('[Academia PT Digital] Nenhum curso encontrado no endpoint AJAX.');
      }
      return results;
    } catch (error: unknown) {
      this.logger.error(
        `[Academia PT Digital] Erro ao obter cursos: ${String(error)}`,
      );
      return [];
    }
  }

  private parseHtml(html: string, seen: Set<string>): CourseResult[] {
    const $ = cheerio.load(html);
    const results: CourseResult[] = [];

    // Layout atual (2025+): cada curso tem classe .course-item dentro de .row
    // Estrutura do card:
    //   <div class="col-12 col-md-6 course-item card-col-h-equal">
    //     <div class="card card-stats card-shadow">
    //       <div class="card-body">
    //         <p class="mt-3">{título}</p>
    //         <p class="mt-3 font-weight-300">{descrição}</p>
    //         <p class="mt-3 mb-0 font-weight-300"><span>Iniciado</span> | <span>2h 0m</span> | <span>Português</span></p>
    //         <button onclick="location.href='/Course/CursoDetalhe/{id}'">Saber mais</button>
    //       </div>
    //     </div>
    //   </div>
    $('.course-item').each((_, el) => {
      const card = $(el);
      const body = card.find('.card-body');

      // Extrair título: primeiro <p class="mt-3"> sem font-weight-300
      const paragraphs = body.find('p.mt-3');
      let title = '';
      let description = '';
      paragraphs.each((i, p) => {
        const text = $(p).text().trim();
        if (!text) return;
        if (i === 0) title = text;
        else if (i === 1 && !$(p).hasClass('mb-0')) description = text;
      });

      if (!title || seen.has(title)) return;

      // Extrair URL via onclick do botão "Saber mais"
      let coursePath = '';
      body.find('button[onclick]').each((_, btn) => {
        const onclick = $(btn).attr('onclick') ?? '';
        const m = onclick.match(/location\.href='([^']+)'/);
        if (m) { coursePath = m[1]; return false; }
      });
      if (!coursePath) return;

      const url = `${BASE_URL}${coursePath}`;

      // Extrair metadata: "Iniciado | 2h 0m | Português"
      const metaEl = body.find('p.mt-3.mb-0');
      const metaText = metaEl.text();
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

    return results;
  }
}
