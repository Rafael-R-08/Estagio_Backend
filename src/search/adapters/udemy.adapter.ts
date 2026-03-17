import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CourseResult,
  IPlatformAdapter,
  PlatformConfig,
} from '../interfaces/platform-adapter.interface';

export class UdemyAdapter implements IPlatformAdapter {
  readonly platformName = 'Udemy';
  private readonly logger = new Logger(UdemyAdapter.name);

  constructor(
    private readonly http: HttpService,
    private readonly platform: PlatformConfig,
  ) {}

  async search(query: string, limit: number): Promise<CourseResult[]> {
    try {
      this.logger.log(`[Udemy] A pesquisar: "${query}"`);

      // Verifica se existe API Key 
      if (!this.platform.config.apiKey) {
        this.logger.warn(`[Udemy] apiKey não configurada na plataforma Udemy. Ignorando pesquisa.`);
        return [];
      }

      // auth header assumes base64 client_id:client_secret is saved in apiKey
      const authHeader = `Basic ${this.platform.config.apiKey}`;
      const url = this.platform.apiEndpoint || 'https://www.udemy.com/api-2.0/courses/';

      const response = await firstValueFrom(
        this.http
          .get(url, {
            headers: {
              Authorization: authHeader,
              Accept: 'application/json, text/plain, */*',
            },
            params: {
              search: query,
              page_size: limit,
              'fields[course]': 'title,headline,url,image_480x270,instructor_name,visible_instructors',
            },
          })
          .pipe(timeout(15_000)),
      );

      const rawResults = (response.data as { results?: unknown[] })?.results ?? [];

      return rawResults.map((item) => this.normalize(item as Record<string, unknown>));
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
         this.logger.error(`[Udemy] Erro de Autenticação - Verifica as API Keys configuradas.`);
      } else {
         this.logger.error(`[Udemy] Erro ao pesquisar: ${String(error?.message || error)}`);
      }
      return [];
    }
  }

  private normalize(item: Record<string, unknown>): CourseResult {
    // URL na Udemy API vem relativo, ex: /course/python-for-beginners/
    const baseUrl = 'https://www.udemy.com';
    const relativeUrl = String(item.url ?? '');
    const finalUrl = relativeUrl.startsWith('http') ? relativeUrl : `${baseUrl}${relativeUrl}`;
    
    // External ID (prefixado com id na tabela local)
    const externalId = `udemy:${String(item.id)}`;

    // Instrutor
    const instructors = item.visible_instructors as Array<{title?: string}> | undefined;
    const instructorName = instructors?.[0]?.title ?? String(item.instructor_name ?? 'Instructor Udemy');

    return {
      externalId,
      title: String(item.title ?? 'Curso Udemy'),
      description: String(item.headline ?? ''),
      url: finalUrl,
      instructor: instructorName,
      tags: [], 
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }
}
