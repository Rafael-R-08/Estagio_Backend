// src/search/search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/services/ai.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { CourseResult, IPlatformAdapter } from './interfaces/platform-adapter.interface';
import { MicrosoftLearnAdapter } from './adapters/microsoft-learn.adapter';
import { AcademiaPortugalDigitalAdapter } from './adapters/academia-portugal-digital.adapter';
import { UdemyAdapter } from './adapters/udemy.adapter';
import { TrailheadAdapter } from './adapters/trailhead.adapter';
import { IbmSkillsBuildAdapter } from './adapters/ibm-skillsbuild.adapter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseBatchCreatedEvent, CourseCreatedEvent } from '../ai/events/course-indexing.event';
import { ChunkSource } from '@prisma/client';

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
    private readonly embeddingService: EmbeddingService,
    private readonly http: HttpService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Obtém plataformas disponíveis para pesquisa
   */
  async getAvailablePlatforms() {
    return this.prisma.learningPlatform.findMany({
      where: { enabled: true, searchEnabled: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Pesquisa principal unificando múltiplas plataformas e ranking semântico
   */
  async search(dto: SearchQueryDto, userId?: string): Promise<SearchResponse> {
    const { q, limit = 10, platforms: platformNames, isFree, minRating, minRelevance } = dto;

    const platforms = await this.prisma.learningPlatform.findMany({
      where: {
        enabled: true,
        searchEnabled: true,
        ...(platformNames?.length ? { name: { in: platformNames } } : {}),
      },
    });

    if (platforms.length === 0) {
      return { query: q, total: 0, results: [], platforms: [], semanticRanking: false };
    }

    const platformIds = platforms.map((p) => p.id);

    // 1. Tentar cache da DB
    let results = await this.searchFromCache(q, platformIds, limit * 2, isFree, minRating, minRelevance);
    
    if (results.length === 0) {
      // 2. Cache miss -> Busca externa em paralelo
      const adapters = platforms.map((p) => this.createAdapter(p)).filter(Boolean) as IPlatformAdapter[];
      const rawResults = await Promise.allSettled(
        adapters.map((adapter) => adapter.search(q, limit, { isFree, minRating, minRelevance })),
      );

      const allCourses: CourseResult[] = rawResults.flatMap((r) =>
        r.status === 'fulfilled' ? r.value : [],
      );

      // 3. Persistir e emitir evento de indexação
      const { newCourses } = await this.cacheResults(allCourses, platforms);
      
      if (newCourses.length > 0) {
        const events = newCourses.map(c => new CourseCreatedEvent(
          c.id, c.title, c.description, c.platform.name, c.tags?.[0], c.level || undefined, ChunkSource.EXTERNAL_COURSE
        ));
        this.eventEmitter.emit('course.batch_created', new CourseBatchCreatedEvent(events));
      }

      results = allCourses;
    }

    // 4. Integrar Ratings Internos (Softinsa)
    const enrichedResults = await this.enrichWithInternalStats(results);

    // 5. Ranking Semântico com cache de embeddings
    let rankedResults = enrichedResults;
    let semanticRankingStatus = false;
    try {
      rankedResults = await this.semanticRank(q, enrichedResults);
      semanticRankingStatus = true;
    } catch (error) {
      this.logger.warn(`Ranking semântico falhou: ${error.message}`);
    }

    return {
      query: q,
      total: rankedResults.length,
      results: rankedResults.slice(0, limit),
      platforms: platforms.map((p) => p.name),
      semanticRanking: semanticRankingStatus,
    };
  }

  /**
   * Ranking semântico com cache de embeddings por curso (24h)
   */
  async semanticRank(query: string, courses: CourseResult[]): Promise<CourseResult[]> {
    if (courses.length === 0) return courses;

    try {
      const queryEmbedding = await this.embeddingService.embed(query);

      const courseEmbeddings = await Promise.all(
        courses.map(async (c) => {
          const cacheKey = `course_embedding:${c.externalId}`;
          const text = `${c.title}. ${c.description?.slice(0, 300) || ''}`;
          return this.getOrCreateEmbedding(cacheKey, text, 86400);
        })
      );

      return courses
        .map((course, i) => {
          const emb = courseEmbeddings[i];
          const score = emb ? this.cosineSimilarity(queryEmbedding, emb) : 0;
          return { ...course, similarityScore: score };
        })
        .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0));
    } catch (error) {
      this.logger.error(`Erro no semanticRank: ${error.message}`);
      return courses;
    }
  }

  private async getOrCreateEmbedding(cacheKey: string, text: string, ttl: number): Promise<number[] | null> {
    try {
      const cached = await this.aiService.cache.get(cacheKey);
      if (cached) return JSON.parse(cached);

      const embedding = await this.embeddingService.embed(text);
      await this.aiService.cache.set(cacheKey, JSON.stringify(embedding), ttl);
      return embedding;
    } catch {
      return null;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private async searchFromCache(query: string, platformIds: string[], limit: number, isFree?: boolean, minRating?: number, minRelevance?: number): Promise<CourseResult[]> {
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const orConditions = terms.flatMap((t) => [
      { title: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
    ]);

    const courses = await this.prisma.course.findMany({
      where: {
        platformId: { in: platformIds },
        AND: [
            { OR: orConditions },
            ...(isFree !== undefined ? [{ isFree }] : []),
            ...(minRating !== undefined ? [{ rating: { gte: minRating } }] : []),
        ]
      },
      include: { platform: { select: { name: true } } },
      take: limit,
      orderBy: { lastUpdated: 'desc' }
    });

    return courses.map(c => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description || '',
      url: c.url,
      instructor: c.instructor || undefined,
      rating: c.rating || undefined,
      durationHours: c.durationHours || undefined,
      level: c.level as any,
      isFree: c.isFree === null ? undefined : c.isFree,
      tags: c.tags,
      platformId: c.platformId,
      platformName: c.platform.name,
    }));
  }

  /**
   * Agrega estatísticas internas (rating e relevância) baseadas no histórico dos utilizadores
   */
  private async enrichWithInternalStats(courses: CourseResult[]): Promise<CourseResult[]> {
    if (courses.length === 0) return courses;

    const urls = courses.map(c => c.url);
    const stats = await this.prisma.trainingRecord.groupBy({
      by: ['url'],
      where: { url: { in: urls } },
      _avg: { rating: true, relevance: true },
    });

    const statsMap = new Map(stats.map(s => [s.url, s._avg]));

    return courses.map(c => {
      const s = statsMap.get(c.url);
      return {
        ...c,
        internalRating: s?.rating ? Math.round(s.rating * 10) / 10 : undefined,
        internalRelevance: s?.relevance ? Math.round(s.relevance * 10) / 10 : undefined,
      };
    });
  }

  private async cacheResults(courses: CourseResult[], platforms: any[]): Promise<{ newCourses: any[] }> {
    const platformMap = new Map(platforms.map(p => [p.name, p.id]));
    const newCourses: any[] = [];

    for (const course of courses) {
      const platformId = course.platformId || platformMap.get(course.platformName);
      if (!platformId) continue;

      const existing = await this.prisma.course.findFirst({
        where: { platformId, externalId: course.externalId },
      });

      if (existing) {
        await this.prisma.course.update({
          where: { id: existing.id },
          data: { title: course.title, description: course.description, rating: course.rating, lastUpdated: new Date() },
        });
      } else {
        const created = await this.prisma.course.create({
          data: {
            platformId,
            externalId: course.externalId,
            title: course.title,
            description: course.description,
            url: course.url,
            isFree: course.isFree,
            tags: course.tags,
          },
          include: { platform: true }
        });
        newCourses.push(created);
      }
    }
    return { newCourses };
  }

  async getCourseByExternalId(externalId: string) {
    return this.prisma.course.findFirst({
        where: { externalId },
        include: { platform: { select: { id: true, name: true } } },
    });
  }

  async getRelatedCourses(externalId: string, limit = 4) {
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

    return related.map(c => ({
        externalId: c.externalId,
        title: c.title,
        description: c.description || '',
        url: c.url,
        instructor: c.instructor || undefined,
        rating: c.rating || undefined,
        durationHours: c.durationHours || undefined,
        level: c.level ?? undefined,
        isFree: c.isFree === null ? undefined : c.isFree,
        tags: c.tags,
        platformId: c.platformId,
        platformName: c.platform.name,
    })) as CourseResult[];
  }

  private createAdapter(platform: any): IPlatformAdapter | null {
    const cfg = { id: platform.id, name: platform.name, apiEndpoint: platform.apiEndpoint, config: platform.config };
    switch (platform.name) {
      case 'Microsoft Learn': return new MicrosoftLearnAdapter(this.http, cfg);
      case 'Academia Portugal Digital': return new AcademiaPortugalDigitalAdapter(this.http, cfg);
      case 'Udemy': return new UdemyAdapter(this.http, cfg);
      case 'Trailhead': return new TrailheadAdapter(this.http, cfg);
      case 'IBM SkillsBuild': return new IbmSkillsBuildAdapter(this.http, cfg);
      default: return null;
    }
  }
}
