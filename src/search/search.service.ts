import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { CourseResult, IPlatformAdapter } from './interfaces/platform-adapter.interface';
import { MicrosoftLearnAdapter } from './adapters/microsoft-learn.adapter';
import { AcademiaPortugalDigitalAdapter } from './adapters/academia-portugal-digital.adapter';
import { UdemyAdapter } from './adapters/udemy.adapter';
import { TrailheadAdapter } from './adapters/trailhead.adapter';
import { IbmSkillsBuildAdapter } from './adapters/ibm-skillsbuild.adapter';
import { SoftinsaLearningAdapter } from './adapters/softinsa-learning.adapter';

export interface SearchResponse {
  query: string;
  total: number;
  results: CourseResult[];
  platforms: string[];
  semanticRanking: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly http: HttpService,
  ) {}

  async getAvailablePlatforms() {
    return this.prisma.learningPlatform.findMany({
      where: { enabled: true, searchEnabled: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  async search(dto: SearchQueryDto, userId?: string): Promise<SearchResponse> {
    const { q, limit = 10, platforms: platformNames } = dto;

    // 1. Carregar plataformas activas da DB
    const platforms = await this.prisma.learningPlatform.findMany({
      where: {
        enabled: true,
        searchEnabled: true,
        ...(platformNames?.length
          ? { name: { in: platformNames } }
          : {}),
      },
    });

    if (platforms.length === 0) {
      return { query: q, total: 0, results: [], platforms: [], semanticRanking: false };
    }

    // 2. Sempre pesquisa em todas as plataformas ativas, a não ser que haja um filtro explícito na query.
    // (Anteriormente, usava-se o userPreferences.enabledPlatforms como fallback, o que escondia novas
    // plataformas acabadas de ser adicionadas pelo admin até o utilizador as ativar manualmente).
    let activePlatformIds = platforms.map((p) => p.id);

    const activePlatforms = platforms.filter((p) =>
      activePlatformIds.includes(p.id),
    );

    // 3. Tentar cache da DB primeiro
    const cached = await this.searchFromCache(q, activePlatformIds, limit);
    if (cached.length > 0) {
      this.logger.log(`[Search] "${q}" → cache DB (${cached.length} resultados)`);
      let rankedCached = cached;
      try {
        rankedCached = await this.rankSemantically(q, cached);
      } catch { /* usa ordem original */ }
      return {
        query: q,
        total: rankedCached.length,
        results: rankedCached,
        platforms: activePlatforms.map((p) => p.name),
        semanticRanking: true,
      };
    }

    // 4. Cache miss → ir às plataformas externas
    const adapters = activePlatforms
      .map((p) => this.createAdapter(p))
      .filter(Boolean) as IPlatformAdapter[];

    const rawResults = await Promise.allSettled(
      adapters.map((adapter) => adapter.search(q, limit)),
    );

    const allCourses: CourseResult[] = rawResults.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : [],
    );

    this.logger.log(
      `[Search] "${q}" → ${allCourses.length} resultados de ${adapters.length} plataformas`,
    );

    // 5. Ranking semântico com embeddings (assíncrono, best-effort)
    let rankedCourses = allCourses;
    let semanticRanking = false;

    try {
      rankedCourses = await this.rankSemantically(q, allCourses);
      semanticRanking = true;
    } catch (e: unknown) {
      this.logger.warn(`[Search] Ranking semântico falhou: ${String(e)}. A usar ordem original.`);
    }

    // 6. Guardar resultados na cache (Course table) — fire-and-forget
    this.cacheResults(rankedCourses, activePlatforms).catch((e: unknown) =>
      this.logger.warn(`[Search] Cache write ignorada: ${String(e)}`),
    );

    return {
      query: q,
      total: rankedCourses.length,
      results: rankedCourses.slice(0, limit * activePlatforms.length),
      platforms: activePlatforms.map((p) => p.name),
      semanticRanking,
    };
  }

  // ------------------------------------------------------------------
  // Pesquisa na cache da DB
  // ------------------------------------------------------------------
  private async searchFromCache(
    query: string,
    platformIds: string[],
    limit: number,
  ): Promise<CourseResult[]> {
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    // OR entre todos os termos em título e descrição
    const orConditions = terms.flatMap((t) => [
      { title: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
    ]);

    const courses = await this.prisma.course.findMany({
      where: {
        platformId: { in: platformIds },
        OR: orConditions,
      },
      include: {
        platform: { select: { name: true } },
      },
      orderBy: { lastUpdated: 'desc' },
      take: limit * platformIds.length,
    });

    return courses.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description ?? '',
      url: c.url,
      instructor: c.instructor ?? undefined,
      rating: c.rating ?? undefined,
      durationHours: c.durationHours ?? undefined,
      level: c.level as CourseResult['level'] | undefined,
      tags: c.tags,
      platformId: c.platformId,
      platformName: c.platform.name,
    }));
  }

  // ------------------------------------------------------------------
  // Ranking semântico — cosine similarity entre query embedding e
  // embeddings das descrições dos cursos
  // ------------------------------------------------------------------
  private async rankSemantically(
    query: string,
    courses: CourseResult[],
  ): Promise<CourseResult[]> {
    if (courses.length === 0) return courses;

    const queryEmbedding = await this.aiService.embed(query);

    // Gerar embeddings dos cursos (apenas título + descrição curta)
    const courseEmbeddings = await Promise.all(
      courses.map((c) =>
        this.aiService
          .embed(`${c.title}. ${c.description.slice(0, 200)}`)
          .catch(() => null),
      ),
    );

    return courses
      .map((course, i) => {
        const emb = courseEmbeddings[i];
        const score = emb ? this.cosineSimilarity(queryEmbedding, emb) : 0;
        return { ...course, similarityScore: score };
      })
      .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  // ------------------------------------------------------------------
  // Cache de cursos na DB (Course table)
  // ------------------------------------------------------------------
  private async cacheResults(
    courses: CourseResult[],
    platforms: Array<{ id: string; name: string }>,
  ): Promise<void> {
    const platformMap = new Map(platforms.map((p) => [p.name, p.id]));

    for (const course of courses) {
      const platformId = course.platformId || platformMap.get(course.platformName);
      if (!platformId) continue;

      const existing = await this.prisma.course.findFirst({
        where: { platformId, externalId: course.externalId },
        select: { id: true },
      });

      if (existing) {
        await this.prisma.course.update({
          where: { id: existing.id },
          data: {
            title: course.title,
            description: course.description,
            url: course.url,
            instructor: course.instructor,
            rating: course.rating,
            durationHours: course.durationHours,
            level: course.level,
            tags: course.tags,
            lastUpdated: new Date(),
          },
        });
      } else {
        await this.prisma.course.create({
          data: {
            platformId,
            externalId: course.externalId,
            title: course.title,
            description: course.description,
            url: course.url,
            instructor: course.instructor,
            rating: course.rating,
            durationHours: course.durationHours,
            level: course.level,
            tags: course.tags,
          },
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Course detail by externalId (from Course cache table)
  // ------------------------------------------------------------------

  async getCourseByExternalId(externalId: string) {
    const course = await this.prisma.course.findFirst({
      where: { externalId },
      include: { platform: { select: { id: true, name: true } } },
    });
    return course ?? null;
  }

  async getRelatedCourses(externalId: string, limit = 4): Promise<CourseResult[]> {
    const course = await this.prisma.course.findFirst({
      where: { externalId },
      select: { tags: true, platformId: true, id: true },
    });
    if (!course || course.tags.length === 0) return [];

    const related = await this.prisma.course.findMany({
      where: {
        id: { not: course.id },
        platformId: course.platformId,
        tags: { hasSome: course.tags },
      },
      include: { platform: { select: { id: true, name: true } } },
      take: limit,
    });

    return related.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description ?? '',
      url: c.url,
      instructor: c.instructor ?? undefined,
      rating: c.rating ?? undefined,
      durationHours: c.durationHours ?? undefined,
      level: c.level ?? undefined,
      tags: c.tags,
      platformId: c.platformId,
      platformName: c.platform.name,
    }));
  }

  // ------------------------------------------------------------------
  // Factory de adapters por nome de plataforma
  // ------------------------------------------------------------------
  private createAdapter(platform: {
    id: string;
    name: string;
    apiEndpoint: string | null;
    config: any;
  }): IPlatformAdapter | null {
    const cfg = {
      id: platform.id,
      name: platform.name,
      apiEndpoint: platform.apiEndpoint,
      config: platform.config as Record<string, any>,
    };

    switch (platform.name) {
      case 'Microsoft Learn':
        return new MicrosoftLearnAdapter(this.http, cfg);
      case 'Academia Portugal Digital':
        return new AcademiaPortugalDigitalAdapter(this.http, cfg);
      case 'Udemy':
        return new UdemyAdapter(this.http, cfg);
      case 'Trailhead':
        return new TrailheadAdapter(this.http, cfg);
      case 'IBM SkillsBuild':
        return new IbmSkillsBuildAdapter(this.http, cfg);
      case 'Softinsa Everyday Learning':
        return new SoftinsaLearningAdapter(this.prisma, cfg);
      default:
        this.logger.warn(`[Search] Sem adapter para plataforma: ${platform.name}`);
        return null;
    }
  }
}
