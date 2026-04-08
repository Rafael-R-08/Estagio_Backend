import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MicrosoftLearnAdapter } from './adapters/microsoft-learn.adapter';
import { IbmSkillsBuildAdapter } from './adapters/ibm-skillsbuild.adapter';
import { AcademiaPortugalDigitalAdapter } from './adapters/academia-portugal-digital.adapter';
import { TrailheadAdapter } from './adapters/trailhead.adapter';
import { CourseDbService } from './course-db.service';
import type { CourseResult } from './interfaces/platform-adapter.interface';

/**
 * CatalogSyncService
 *
 * Executa jobs periódicos de indexação de catálogos de plataformas externas.
 * Descola a obtenção de dados do momento da pesquisa do utilizador:
 * - Pesquisas em tempo real consultam a BD local (rápido, sem dependência de rede)
 * - Este serviço atualiza essa BD em segundo plano, de madrugada
 *
 * Agendamento:
 *   03:00 diário  — MS Learn (Catalog API ~13 MB, 1 pedido)
 *   04:00 diário  — IBM SkillsBuild (scraping/cache + sitemap)
 *   05:00 diário  — Trailhead (sitemap.xml)
 *   02:00 domingo — Academia PT Digital (scraping paginado)
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    private readonly msLearn: MicrosoftLearnAdapter,
    private readonly ibm: IbmSkillsBuildAdapter,
    private readonly academia: AcademiaPortugalDigitalAdapter,
    private readonly trailhead: TrailheadAdapter,
    private readonly dbService: CourseDbService,
  ) {}

  // ─── Cron jobs ─────────────────────────────────────────────────────────────

  /** Diariamente às 03:00 — Microsoft Learn (Catalog API) */
  @Cron('0 3 * * *')
  async syncMicrosoftLearn(): Promise<void> {
    this.logger.log('[CatalogSync] MS Learn — a iniciar sincronização...');
    await this.runSync('mslearn', () => this.msLearn.getAllCourses(true));
  }

  /** Diariamente às 04:00 — IBM SkillsBuild */
  @Cron('0 4 * * *')
  async syncIbmSkillsBuild(): Promise<void> {
    this.logger.log(
      '[CatalogSync] IBM SkillsBuild — a iniciar sincronização...',
    );
    await this.runSync('ibm', () => this.ibm.getAllCourses(true));
  }

  /** Diariamente às 05:00 — Trailhead (sitemap) */
  @Cron('0 5 * * *')
  async syncTrailhead(): Promise<void> {
    this.logger.log('[CatalogSync] Trailhead — a iniciar sincronização...');
    await this.runSync('trailhead', () => this.trailhead.getFullCatalog(true));
  }

  /** Semanalmente ao domingo às 02:00 — Academia Portugal Digital */
  @Cron('0 2 * * 0')
  async syncAcademiaPt(): Promise<void> {
    this.logger.log(
      '[CatalogSync] Academia PT Digital — a iniciar sincronização...',
    );
    await this.runSync('academiapt', () => this.academia.getAllCourses(true));
  }

  // ─── Triggers manuais (utilitário para administração) ──────────────────────

  /**
   * Força sincronização imediata de todas as plataformas.
   * Usado pelo endpoint de administração `/admin/catalog-sync`.
   */
  async syncAll(): Promise<Record<string, number>> {
    this.logger.log(
      '[CatalogSync] Sincronização manual de todas as plataformas...',
    );

    const [msLearnCount, ibmCount, trailheadCount, academiaCount] =
      await Promise.allSettled([
        this.runSync('mslearn', () => this.msLearn.getAllCourses(true)),
        this.runSync('ibm', () => this.ibm.getAllCourses(true)),
        this.runSync('trailhead', () => this.trailhead.getFullCatalog(true)),
        this.runSync('academiapt', () => this.academia.getAllCourses(true)),
      ]);

    return {
      mslearn: msLearnCount.status === 'fulfilled' ? msLearnCount.value : 0,
      ibm: ibmCount.status === 'fulfilled' ? ibmCount.value : 0,
      trailhead:
        trailheadCount.status === 'fulfilled' ? trailheadCount.value : 0,
      academiapt:
        academiaCount.status === 'fulfilled' ? academiaCount.value : 0,
    };
  }

  /**
   * Força sincronização imediata de uma única plataforma.
   * Retorna o número de cursos indexados.
   */
  async syncPlatform(platformId: string): Promise<number> {
    switch (platformId) {
      case 'mslearn':
        return this.runSync('mslearn', () => this.msLearn.getAllCourses(true));
      case 'ibm':
        return this.runSync('ibm', () => this.ibm.getAllCourses(true));
      case 'trailhead':
        return this.runSync('trailhead', () =>
          this.trailhead.getFullCatalog(true),
        );
      case 'academiapt':
        return this.runSync('academiapt', () =>
          this.academia.getAllCourses(true),
        );
      default:
        this.logger.warn(
          `[CatalogSync] Plataforma desconhecida: ${platformId}`,
        );
        return 0;
    }
  }

  // ─── Núcleo ────────────────────────────────────────────────────────────────

  /**
   * Executa a função de obtenção do catálogo, persiste os resultados na BD
   * e devolve o número de cursos processados.
   */
  private async runSync(
    platformId: string,
    fetcher: () => Promise<CourseResult[]>,
  ): Promise<number> {
    const start = Date.now();
    try {
      const courses = await fetcher();
      if (courses.length === 0) {
        this.logger.warn(
          `[CatalogSync] ${platformId}: 0 cursos obtidos — BD não atualizada.`,
        );
        return 0;
      }

      await this.dbService.cacheResults(platformId, courses);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.logger.log(
        `[CatalogSync] ${platformId}: ${courses.length} cursos indexados em ${elapsed}s.`,
      );
      return courses.length;
    } catch (err: unknown) {
      this.logger.error(
        `[CatalogSync] ${platformId}: erro durante sincronização — ${String(err)}`,
      );
      return 0;
    }
  }
}
