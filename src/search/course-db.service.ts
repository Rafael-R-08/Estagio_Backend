import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseResult } from './interfaces/platform-adapter.interface';
import { CourseLevel, Prisma } from '@prisma/client';
import { isLikelyTrainingResult } from './utils/training-result-filter.util';

@Injectable()
export class CourseDbService {
  private readonly logger = new Logger(CourseDbService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pesquisa cursos na base de dados local com suporte a relevância básica e filtros.
   */
  async searchFromCache(
    q: string,
    limit: number,
    filters?: { isFree?: boolean; minRating?: number; minRelevance?: number; platforms?: string[]; level?: string; language?: string }
  ): Promise<CourseResult[]> {
    const query = q || '';
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    
    const where: Prisma.CourseWhereInput = {};

    if (terms.length > 0) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' as Prisma.QueryMode } },
        ...terms.map(t => ({ title: { contains: t, mode: 'insensitive' as Prisma.QueryMode } })),
        { description: { contains: q, mode: 'insensitive' as Prisma.QueryMode } }
      ];
    }

    if (filters?.isFree !== undefined) {
      where.isFree = filters.isFree;
    }

    if (filters?.platforms && filters.platforms.length > 0) {
      where.platform = { name: { in: filters.platforms } };
    }

    if (filters?.minRating !== undefined) {
      where.rating = { gte: filters.minRating };
    }

    if (filters?.level) {
      where.level = filters.level as any;
    }

    if (filters?.language) {
      where.language = filters.language;
    }

    const courses = await this.prisma.course.findMany({
      where,
      include: { platform: true },
      take: limit * 2,
      orderBy: terms.length === 0
        ? [{ rating: 'desc' as const }, { lastUpdated: 'desc' as const }]
        : { lastUpdated: 'desc' as const },
    });

    // Ranking básico de texto se houver query
    const results = courses.map(c => {
      let score = 0;
      const title = c.title.toLowerCase();
      const desc = (c.description || '').toLowerCase();
      
      if (terms.length > 0) {
         if (title.includes(q.toLowerCase())) score += 10;
         terms.forEach(t => {
           if (title.includes(t)) score += 5;
           if (desc.includes(t)) score += 1;
         });
      }

      return {
        externalId: c.externalId,
        title: c.title,
        description: c.description || '',
        url: c.url,
        instructor: c.instructor || undefined,
        rating: c.rating || undefined,
        durationHours: c.durationHours || undefined,
        level: c.level as any,
        tags: c.tags,
        isFree: c.isFree ?? undefined,
        language: c.language || undefined,
        platformId: c.platformId,
        platformName: c.platform.name,
        _localScore: score
      };
    });

    return results
      .filter((r) => isLikelyTrainingResult(r))
      .sort((a, b) => (b._localScore || 0) - (a._localScore || 0))
      .slice(0, limit)
      .map(({ _localScore: _, ...rest }) => rest);
  }

  /**
   * Guarda resultados em cache na BD usando operações bulk (createMany + skipDuplicates).
   */
  async cacheResults(platformId: string, courses: CourseResult[]): Promise<void> {
    if (courses.length === 0) return;

    try {
      const externalIds = courses.map(c => c.externalId);
      
      // 1. Identificar quais já existem
      const existing = await this.prisma.course.findMany({
        where: {
          platformId,
          externalId: { in: externalIds }
        },
        select: { externalId: true, id: true }
      });

      const existingMap = new Map(existing.map(e => [e.externalId, e.id]));
      
      const toCreate = courses.filter(c => !existingMap.has(c.externalId));
      const toUpdate = courses.filter(c => existingMap.has(c.externalId));

      // 2. Bulk Create novos
      if (toCreate.length > 0) {
        await this.prisma.course.createMany({
          data: toCreate.map(c => ({
            platformId,
            externalId: c.externalId,
            title: c.title,
            description: c.description,
            url: c.url,
            instructor: c.instructor,
            rating: c.rating,
            durationHours: c.durationHours,
            level: c.level as CourseLevel,
            tags: c.tags,
            isFree: c.isFree,
            language: c.language,
            lastUpdated: new Date()
          })),
          skipDuplicates: true
        });
      }

      // 3. Atualizar existentes em lote (Prisma não tem updateMany por ID individual fácil, 
      // fazemos apenas se necessário ou para os top N para evitar overhead)
      // Para manter simples e rápido, atualizamos apenas o timestamp de lastUpdated
      if (toUpdate.length > 0) {
        await this.prisma.course.updateMany({
          where: {
            platformId,
            externalId: { in: toUpdate.map(c => c.externalId) }
          },
          data: { lastUpdated: new Date() }
        });
      }

    } catch (error) {
      this.logger.error(`Erro ao fazer cache de resultados: ${error.message}`);
    }
  }

  async findByExternalId(platformId: string, externalId: string) {
    return this.prisma.course.findFirst({
      where: { platformId, externalId }
    });
  }

  async findGlobalByExternalId(externalId: string) {
    return this.prisma.course.findFirst({
      where: { externalId },
      include: { platform: true }
    });
  }

  /**
   * Conta o total de cursos indexados, opcionalmente filtrado.
   * Usado pelo browse mode para o banner "X+ formações disponíveis".
   */
  async countAll(filters?: { isFree?: boolean; minRating?: number; platforms?: string[]; level?: string; language?: string }): Promise<number> {
    const where: Prisma.CourseWhereInput = {};
    if (filters?.isFree !== undefined) where.isFree = filters.isFree;
    if (filters?.platforms && filters.platforms.length > 0) {
      where.platform = { name: { in: filters.platforms } };
    }
    if (filters?.minRating !== undefined) {
      where.rating = { gte: filters.minRating };
    }
    if (filters?.level) {
      where.level = filters.level as any;
    }
    if (filters?.language) {
      where.language = filters.language;
    }
    return this.prisma.course.count({ where });
  }
}
