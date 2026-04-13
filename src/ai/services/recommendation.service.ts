import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import { EmbeddingService, SearchResult } from './embedding.service';
import { CacheService } from '../../cache/cache.service';
import { ChunkSource, TrainingStatus } from '@prisma/client';
import { buildRecommendationPrompt } from '../templates/rag.template';
import { IndexingSeedService } from './indexing-seed.service';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import {
  RecommendationSchema,
  RecommendationOutput,
} from '../parsers/ai.schemas';
import * as crypto from 'crypto';

/** Minimum cosine similarity to consider a chunk relevant */
const SIMILARITY_THRESHOLD = 0.55;
/** Progressive fallback threshold when fewer than 3 courses pass strict threshold */
const FALLBACK_THRESHOLD = 0.4;
/** Min courses before triggering progressive fallback */
const MIN_RELEVANT_COURSES = 3;
/** Top-K chunks per semantic query */
const CHUNKS_PER_QUERY = 8;
/** Recommendation cache TTL — 2 hours */
const CACHE_TTL = 7200;

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private embeddingService: EmbeddingService,
    private cacheService: CacheService,
    private indexingSeedService: IndexingSeedService,
  ) {}

  /**
   * Gera recomendações personalizadas usando RAG direto (sem criar conversas no DB).
   * Pipeline dedicado: 3 queries semânticas focadas → catálogo injetado no prompt → JSON estruturado.
   */
  async recommendForUser(
    userId?: string,
    customQuery?: string,
    topK = CHUNKS_PER_QUERY,
    forceRefresh = false,
  ): Promise<RecommendationOutput & { metadata: any }> {
    this.logger.log(`Recomendações para: ${userId || 'Anónimo'}`);

    if (!userId) {
      return {
        ...this.getFallbackRecommendations('pt'),
        metadata: { info: 'Anonymous recommendation', sources: 0 },
      };
    }

    // 1. Garantir que o Vector Store não está vazio
    const count = await this.prisma.textChunk.count();
    if (count === 0) {
      this.logger.warn('Base vazia. Indexando...');
      await this.indexingSeedService.seedFromExistingData();
    }

    // 2. Carregar perfil completo
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        skills: true,
        settings: true,
        trainings: { select: { title: true, status: true } },
      },
    });

    if (!user) {
      return {
        ...this.getFallbackRecommendations('pt'),
        metadata: { info: 'User not found', sources: 0 },
      };
    }

    const lang = user.settings?.uiLanguage || 'pt';
    const completed = user.trainings
      .filter((t) => t.status === TrainingStatus.completed)
      .map((t) => t.title);
    const ongoing = user.trainings
      .filter((t) => t.status === TrainingStatus.ongoing)
      .map((t) => t.title);

    // 3. Verificar completude do perfil — aviso sem bloquear
    const profileScore = this.computeProfileScore(user);
    if (profileScore < 0.4) {
      this.logger.warn(
        `Perfil incompleto (${Math.round(profileScore * 100)}%) para user ${userId}`,
      );
    }

    const profile = {
      interests: user.interests || [],
      experienceLevel: user.experienceLevel || 'junior',
      completedTrainings: completed,
      ongoingTrainings: ongoing,
      serviceLine: user.serviceLine?.toString(),
      userFunction: user.userFunction || 'Colaborador',
      skills: user.skills.map((s) => ({
        skillName: s.skillName,
        level: s.level,
      })),
    };

    // 4. Profile-hash cache — evita chamar Groq para perfis inalterados
    //    O catalogFingerprint garante que novos cursos indexados invalidam a cache
    const profileHash = this.hashProfile(profile, topK);
    const catalogFingerprint = await this.getCatalogFingerprint();
    const cacheKey = `ai:rec:v2:${userId}:${profileHash}:${catalogFingerprint}`;
    if (forceRefresh) {
      await this.cacheService.del(cacheKey);
      this.logger.debug(`Cache invalidado por refresh para ${userId}`);
    } else {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as RecommendationOutput & {
            metadata: any;
          };
          this.logger.debug(`Cache hit para ${userId}`);
          return { ...parsed, metadata: { ...parsed.metadata, fromCache: true } };
        } catch {
          // ignore corrupt cache
        }
      }
    }

    // 5. Três queries semânticas focadas (uma por categoria)
    const interestsStr = user.interests?.slice(0, 5).join(', ') || 'TI';
    const skillsStr =
      user.skills
        ?.map((s) => s.skillName)
        .slice(0, 5)
        .join(', ') || 'software';
    const roleStr =
      `${user.userFunction || ''} ${user.serviceLine || ''}`.trim() ||
      'tecnologia';

    // Adapt improvement query to user level — avoid 'advanced' bias for junior profiles
    const levelLabel =
      profile.experienceLevel === 'junior'
        ? lang === 'en'
          ? 'foundation courses career path'
          : 'cursos base progressão carreira'
        : profile.experienceLevel === 'intermedio'
          ? lang === 'en'
            ? 'intermediate career growth courses'
            : 'cursos intermédios crescimento carreira'
          : lang === 'en'
            ? 'advanced career improvement courses'
            : 'cursos avançados melhoria carreira';

    const queries = customQuery
      ? [customQuery, customQuery, customQuery]
      : [
          `${levelLabel} ${roleStr}`,
          lang === 'en'
            ? `courses about ${interestsStr}`
            : `cursos sobre ${interestsStr}`,
          lang === 'en'
            ? `courses to learn ${skillsStr}`
            : `cursos para aprender ${skillsStr}`,
        ];

    const source = [ChunkSource.EXTERNAL_COURSE];

    // 6. Pesquisa semântica paralela por categoria
    const [improvementChunks, interestChunks, skillChunks] = await Promise.all([
      this.embeddingService.searchSimilar(queries[0], topK, source),
      this.embeddingService.searchSimilar(queries[1], topK, source),
      this.embeddingService.searchSimilar(queries[2], topK, source),
    ]);

    // 7. Filtragem por similaridade + deduplicação por sourceId
    const allChunks = this.deduplicateChunks([
      ...improvementChunks,
      ...interestChunks,
      ...skillChunks,
    ]);

    // #9 — Fallback progressivo: relaxar threshold se cursos relevantes insuficientes
    let relevant = allChunks.filter(
      (c) => c.similarity >= SIMILARITY_THRESHOLD,
    );
    if (relevant.length < MIN_RELEVANT_COURSES && allChunks.length > 0) {
      this.logger.debug(
        `Fallback progressivo: ${relevant.length} cursos em threshold=${SIMILARITY_THRESHOLD}, ` +
          `a relaxar para ${FALLBACK_THRESHOLD}.`,
      );
      relevant = allChunks.filter((c) => c.similarity >= FALLBACK_THRESHOLD);
    }

    // 8. Detecção de "sem cursos disponíveis"
    const maxSim = Math.max(...allChunks.map((c) => c.similarity), 0);
    if (relevant.length === 0 || maxSim < FALLBACK_THRESHOLD) {
      this.logger.warn(
        `Sem cursos relevantes (maxSim=${maxSim.toFixed(3)}). Retornando fallback.`,
      );
      const fallback = {
        ...this.getFallbackRecommendations(lang),
        metadata: {
          sourcesCount: 0,
          maxSimilarity: maxSim,
          profileScore,
          timestamp: new Date().toISOString(),
        },
      };
      return fallback;
    }

    // 9. Construir catálogo numerado para o prompt
    const excludeSet = new Set(
      [...completed, ...ongoing].map((t) => t.toLowerCase()),
    );
    // #10 — Ordenar por relevância de nível + similaridade antes de cortar a 30
    const userLevel = this.userLevelScore(user.experienceLevel ?? 'intermedio');
    const catalogueCourses = relevant
      .filter((c) => {
        const meta = c.metadata as Record<string, unknown> | null | undefined;
        const title = (meta?.['title'] as string | undefined) ?? '';
        return !excludeSet.has(title.toLowerCase());
      })
      .map((c) => {
        const meta = c.metadata as Record<string, unknown> | null | undefined;
        const courseLevel = this.courseLevelScore(
          (meta?.['level'] as string | undefined) ?? '',
        );
        const levelDiff = Math.abs(userLevel - courseLevel);
        const levelBonus =
          courseLevel === 0
            ? 0
            : levelDiff === 0
              ? 0.08
              : levelDiff === 1
                ? 0
                : -0.05;
        return { chunk: c, score: c.similarity + levelBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.chunk);

    const courseList = this.buildCourseList(catalogueCourses);

    // 10. Construir system prompt e chamar Groq diretamente (sem criar conversas no DB)
    const systemPrompt = buildRecommendationPrompt(profile, courseList, lang);

    const userMessage =
      lang === 'en'
        ? `Generate personalised course recommendations for my profile. Focus on career growth, personal interests, and skill gaps.`
        : `Gera recomendações de cursos personalizadas para o meu perfil. Foca em crescimento de carreira, interesses pessoais e gaps de competências.`;

    const raw = await this.aiService.generateText(userMessage, {
      systemPrompt,
      language: lang as 'pt' | 'en',
      maxTokens: 1500,
      temperature: 0.15,
      responseFormat: 'json_object',
      userId,
    });

    // 11. Parsing e validação Zod
    const recommendations = JsonSafeParser.parse(raw, RecommendationSchema);

    if (!recommendations) {
      this.logger.error(
        'Falha na validação das recomendações. Retornando fallback.',
      );
      return {
        ...this.getFallbackRecommendations(lang),
        metadata: {
          error: 'Validation failed',
          sourcesCount: relevant.length,
          profileScore,
        },
      };
    }

    const result: RecommendationOutput & { metadata: any } = {
      ...recommendations,
      metadata: {
        sourcesCount: relevant.length,
        catalogueSize: catalogueCourses.length,
        maxSimilarity: maxSim,
        profileScore,
        timestamp: new Date().toISOString(),
      },
    };

    // 12. Guardar no cache
    await this.cacheService.set(cacheKey, JSON.stringify(result), CACHE_TTL);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Remove chunks duplicados pelo mesmo sourceId, mantendo o de maior similaridade */
  private deduplicateChunks(chunks: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();
    for (const chunk of chunks) {
      const key = chunk.sourceId || chunk.id;
      const existing = seen.get(key);
      if (!existing || chunk.similarity > existing.similarity) {
        seen.set(key, chunk);
      }
    }
    return [...seen.values()].sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Mapeia ExperienceLevel do utilizador para score numérico (1-5).
   * Permite comparar com o nível do curso para otimizar o catálogo.
   */
  private userLevelScore(level: string): number {
    switch (level.toLowerCase()) {
      case 'junior':
        return 1;
      case 'intermedio':
        return 2;
      case 'senior':
        return 3;
      case 'especialista':
        return 4;
      case 'lider':
        return 5;
      default:
        return 2;
    }
  }

  /**
   * Mapeia CourseLevel para score numérico (1-3).
   * Devolve 0 quando o nível é desconhecido (neutro — sem bónus nem penalização).
   */
  private courseLevelScore(level: string): number {
    switch (level.toLowerCase()) {
      case 'beginner':
        return 1;
      case 'intermediate':
        return 2;
      case 'advanced':
        return 3;
      default:
        return 0;
    }
  }

  /** Extrai o título do curso a partir do conteúdo do chunk (fallback quando metadata.title está vazio). */
  private extractTitleFromContent(content: string): string | undefined {
    // Formato: "CURSO: <título>\nPROVEDOR: ..."
    const match = /^CURSO:\s*(.+)/im.exec(content);
    return match?.[1]?.trim() || undefined;
  }

  /** Constrói catálogo numerado a partir dos chunks relevantes */
  private buildCourseList(chunks: SearchResult[]): string {
    return chunks
      .map((c, i) => {
        const meta = c.metadata as Record<string, unknown> | null | undefined;
        const title =
          (meta?.['title'] as string | undefined) ??
          (meta?.['courseName'] as string | undefined) ??
          this.extractTitleFromContent(c.content) ??
          `Curso ${i + 1}`;
        const level =
          (meta?.['level'] as string | undefined) ??
          (meta?.['experienceLevel'] as string | undefined) ??
          '';
        const rawHours = meta?.['durationHours'];
        const hours = typeof rawHours === 'number' ? `${rawHours}h` : '';
        const extra = [level, hours].filter(Boolean).join(', ');
        return `${i + 1}. ${title}${extra ? ` (${extra})` : ''}`;
      })
      .join('\n');
  }

  /** Calcula score de completude do perfil (0–1) */
  private computeProfileScore(user: {
    interests?: string[] | null;
    experienceLevel?: string | null;
    serviceLine?: unknown;
    userFunction?: string | null;
    skills?: unknown[] | null;
  }): number {
    const fields = [
      (user.interests?.length ?? 0) > 0,
      !!user.experienceLevel,
      !!user.serviceLine,
      !!user.userFunction,
      (user.skills?.length ?? 0) > 0,
    ];
    return fields.filter(Boolean).length / fields.length;
  }

  /** SHA-256 hash do perfil para cache */
  private hashProfile(profile: object, topK: number): string {
    const data = JSON.stringify({ profile, topK });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Fingerprint do catálogo de cursos indexados.
   * Combina count + timestamp do chunk mais recente — invalida a cache
   * automaticamente sempre que novos cursos são indexados.
   */
  private async getCatalogFingerprint(): Promise<string> {
    const agg = await this.prisma.textChunk.aggregate({
      where: { source: ChunkSource.EXTERNAL_COURSE },
      _count: { id: true },
      _max: { createdAt: true },
    });
    const count = agg._count.id;
    const latest = agg._max.createdAt?.getTime() ?? 0;
    return `${count}-${latest}`;
  }

  private getFallbackRecommendations(lang: string): RecommendationOutput {
    const isEn = lang === 'en';
    return {
      courses: [],
      hasContextualCourses: false,
      summary: isEn
        ? 'No indexed courses matched your profile yet. Complete your profile and ensure courses are indexed to receive personalised recommendations.'
        : 'Nenhum curso indexado correspondeu ao teu perfil. Completa o teu perfil e garante que os cursos estão indexados para receber recomendações personalizadas.',
    };
  }
}
