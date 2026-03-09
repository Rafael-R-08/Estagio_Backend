import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CourseResult,
  IPlatformAdapter,
  PlatformConfig,
} from '../interfaces/platform-adapter.interface';

const MS_LEARN_SEARCH_URL =
  'https://learn.microsoft.com/api/search';

const LEVEL_MAP: Record<string, CourseResult['level']> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

export class MicrosoftLearnAdapter implements IPlatformAdapter {
  readonly platformName = 'Microsoft Learn';
  private readonly logger = new Logger(MicrosoftLearnAdapter.name);

  constructor(
    private readonly http: HttpService,
    private readonly platform: PlatformConfig,
  ) {}

  async search(query: string, limit: number): Promise<CourseResult[]> {
    try {
      this.logger.log(`[MS Learn] A pesquisar: "${query}"`);

      const apiUrl =
        this.platform.apiEndpoint ?? MS_LEARN_SEARCH_URL;

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

      return rawResults.map((item) => this.normalize(item));
    } catch (error: unknown) {
      this.logger.error(`[MS Learn] Erro ao pesquisar: ${String(error)}`);
      return [];
    }
  }

  private normalize(item: Record<string, unknown>): CourseResult {
    // Extrair nível do campo levels[]
    const rawLevel = String((item.levels as string[])?.[0] ?? '').toLowerCase();
    const level = LEVEL_MAP[rawLevel];

    // Extrair tags de products[] + roles[]
    const tags: string[] = [
      ...((item.products as string[]) ?? []),
      ...((item.roles as string[]) ?? []),
    ];

    // URL canónica
    const url = String(item.url ?? item.displayUrl ?? '');

    // externalId derivado do path do URL para ser estável
    const externalId = `mslearn:${this.urlToId(url)}`;

    // MS Learn API usa 'summary' ou 'body' dependendo do tipo de conteúdo
    const description = String(
      item.summary || item.body || item.description || '',
    );

    return {
      externalId,
      title: String(item.title ?? 'Sem título'),
      description,
      url,
      level,
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
