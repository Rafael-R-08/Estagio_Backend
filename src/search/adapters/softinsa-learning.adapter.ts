import type {
  CourseResult,
  IPlatformAdapter,
  PlatformConfig,
} from '../interfaces/platform-adapter.interface';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SoftinsaLearningAdapter — Pesquisa na tabela SoftinsaLearning (BD interna).
 * Não necessita de HTTP — lê diretamente via Prisma.
 */
export class SoftinsaLearningAdapter implements IPlatformAdapter {
  readonly platformName = 'Softinsa Everyday Learning';
  private readonly logger = new Logger(SoftinsaLearningAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformConfig,
  ) {}

  async search(query: string, limit: number): Promise<CourseResult[]> {
    this.logger.log(`[Softinsa Learning] A pesquisar: "${query}"`);

    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const orConditions = terms.flatMap((t) => [
      { title: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
      { skills: { has: t } },
    ]);

    const records = await this.prisma.softinsaLearning.findMany({
      where: { OR: orConditions },
      orderBy: [{ mandatory: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    this.logger.log(`[Softinsa Learning] "${query}" → ${records.length} resultados`);

    return records.map((r) => ({
      externalId: `softinsa:${r.id}`,
      title: r.title,
      description: r.description ?? '',
      url: r.url ?? `https://intranet.softinsa.com/learning`,
      level: r.level as CourseResult['level'] | undefined,
      durationHours: r.durationHours ?? undefined,
      tags: [
        ...r.skills,
        ...(r.mandatory ? ['obrigatório'] : []),
        ...(r.department ? [r.department] : []),
      ],
      platformId: this.platform.id,
      platformName: this.platformName,
    }));
  }
}
