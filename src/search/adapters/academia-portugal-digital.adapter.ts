import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CourseResult,
  IPlatformAdapter,
  PlatformConfig,
} from '../interfaces/platform-adapter.interface';

const BASE_URL = 'https://academiaportugaldigital.pt';
const COURSES_URL = `${BASE_URL}/cursos`;

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  iniciado: 'beginner',
  intermédio: 'intermediate',
  avançado: 'advanced',
  intermediate: 'intermediate',
  advanced: 'advanced',
  beginner: 'beginner',
};

export class AcademiaPortugalDigitalAdapter implements IPlatformAdapter {
  readonly platformName = 'Academia Portugal Digital';
  private readonly logger = new Logger(AcademiaPortugalDigitalAdapter.name);

  /** Cache em memória de todos os cursos (validade 1h) */
  private cachedCourses: CourseResult[] = [];
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  constructor(
    private readonly http: HttpService,
    private readonly platform: PlatformConfig,
  ) {}

  async search(query: string, limit: number, filters?: { isFree?: boolean; minRating?: number; minRelevance?: number }): Promise<CourseResult[]> {
    if (filters?.isFree === false) return []; // Academia PT é gratuito

    const allCourses = await this.getAllCourses();
    this.logger.log(`[Academia PT Digital] Total em cache: ${allCourses.length}`);

    if (allCourses.length === 0) return [];

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = allCourses
      .map((c) => {
        const haystack =
          `${c.title} ${c.description} ${c.tags.join(' ')}`.toLowerCase();
        const matchCount = terms.filter((t) => haystack.includes(t)).length;
        return { ...c, _score: matchCount };
      })
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score: _, ...rest }) => rest);

    this.logger.log(
      `[Academia PT Digital] "${query}" → ${scored.length} resultados`,
    );
    return scored;
  }

  // ------------------------------------------------------------------
  // Scraping
  // ------------------------------------------------------------------

  private async getAllCourses(): Promise<CourseResult[]> {
    if (this.cachedCourses.length > 0 && Date.now() < this.cacheExpiry) {
      return this.cachedCourses;
    }

    this.logger.log(`[Academia PT Digital] A fazer HTTP GET de ${COURSES_URL}`);

    try {
      const response = await firstValueFrom(
        this.http
          .get<string>(COURSES_URL, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
              'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
            },
            responseType: 'text',
          })
          .pipe(timeout(20_000)),
      );

      const html: string = response.data;
      this.logger.log(
        `[Academia PT Digital] HTML recebido: ${html.length} chars`,
      );

      const courses = this.parseHtml(html);
      this.logger.log(
        `[Academia PT Digital] Parsed ${courses.length} cursos`,
      );

      this.cachedCourses = courses;
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
    } catch (error: unknown) {
      this.logger.error(
        `[Academia PT Digital] Erro HTTP: ${String(error)}`,
      );
    }

    return this.cachedCourses;
  }

  // ------------------------------------------------------------------
  // Parse HTML
  // ------------------------------------------------------------------
  private parseHtml(html: string): CourseResult[] {
    const results: CourseResult[] = [];
    const seen = new Set<string>();

    // O site rendería cada curso num bloco com o padrão:
    // Título \n Descrição \n Iniciado | Xh Ym | Português
    // Extrair com regex sobre o texto puro do HTML

    // Remove tags HTML e entidades para facilitar o parse
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Encontrar URLs de cursos no HTML original
    const urlMap = new Map<string, string>();
    const linkRegex =
      /href=["']((?:https?:\/\/academiaportugaldigital\.pt)?\/formacao\/[^"'\s]+)["']/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      // slug = último segmento do URL
      const slug = href.replace(/.*\/formacao\//, '').replace(/\/$/, '');
      urlMap.set(slug, url);
    }

    // Padrão de metadata: "Iniciado | 3h 0m | Português"
    const metaRegex =
      /(Iniciado|Interm[e\u00e9]dio|Avan[c\u00e7]ado)\s*\|\s*(\d+)h\s*(\d+)m?\s*\|\s*(\w+)/gi;

    let match: RegExpExecArray | null;
    while ((match = metaRegex.exec(text)) !== null) {
      const levelRaw = match[1].toLowerCase();
      const hours = parseInt(match[2], 10);
      const metaIndex = match.index;

      // Texto antes da metadata (até 500 chars) para extrair título e descrição
      const before = text.slice(Math.max(0, metaIndex - 500), metaIndex);
      const lines = before
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) continue;

      // Título: última linha não vazia antes da metadata com tamanho razoável
      let title = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (
          l.length >= 5 &&
          l.length <= 150 &&
          !l.toLowerCase().includes('saber mais') &&
          !l.toLowerCase().includes('guardar') &&
          !l.toLowerCase().includes('plano de forma') &&
          !/^\d+$/.test(l)
        ) {
          title = l;
          break;
        }
      }

      if (!title || seen.has(title)) continue;
      seen.add(title);

      // Descrição: linhas entre o título e a metadata
      const titleIdx = lines.lastIndexOf(title);
      const descLines = lines
        .slice(titleIdx + 1)
        .filter(
          (l) =>
            l.length > 20 &&
            !l.toLowerCase().includes('saber mais') &&
            !l.toLowerCase().includes('guardar'),
        );
      const description = descLines.join(' ').slice(0, 400);

      // Tentar encontrar URL para este curso
      const titleSlug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Procurar URL cujo slug seja parecido com o título
      let courseUrl = COURSES_URL;
      for (const [slug, url] of urlMap.entries()) {
        if (
          slug.includes(titleSlug.slice(0, 15)) ||
          titleSlug.includes(slug.slice(0, 15))
        ) {
          courseUrl = url;
          break;
        }
      }

      results.push({
        externalId: `academiapt:${titleSlug.slice(0, 60)}`,
        title,
        description,
        url: courseUrl,
        level: LEVEL_MAP[levelRaw],
        durationHours: hours || undefined,
        isFree: true,
        tags: [],
        platformId: this.platform.id,
        platformName: this.platformName,
      });
    }

    return results;
  }
}
