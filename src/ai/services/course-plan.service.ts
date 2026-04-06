import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { CacheService } from '../../cache/cache.service';
import { ChunkSource } from '@prisma/client';
import { buildCoursePlanPrompt } from '../templates/course-plan.template';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import { CoursePlanSchema } from '../parsers/ai.schemas';
import { CoursePlanResponse } from '../dto/course-plan.dto';

/** Cache TTL de 12 horas para planos de curso */
const PLAN_CACHE_TTL = 43200;

@Injectable()
export class CoursePlanService {
  private readonly logger = new Logger(CoursePlanService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private embeddingService: EmbeddingService,
    private cacheService: CacheService,
  ) {}

  async generateCoursePlan(
    trainingId: string,
    userId: string,
    focus?: string,
  ): Promise<CoursePlanResponse> {
    const training = await this.prisma.trainingRecord.findFirst({
      where: { id: trainingId, userId },
      include: { platform: { select: { name: true } } },
    });

    if (!training) {
      throw new NotFoundException(
        'Formação não encontrada ou não pertence ao utilizador.',
      );
    }

    const lang = await this.getUserLanguage(userId);

    // Cache lookup — chave inclui focus para planos distintos por foco
    const cacheKey = `ai:plan:${userId}:${trainingId}:${focus ?? 'default'}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      try {
        this.logger.debug(`Cache hit para plano ${trainingId}`);
        return JSON.parse(cached) as CoursePlanResponse;
      } catch {
        // cache corrompido — ignorar e regenerar
      }
    }

    // Fetch relevant chunks for this course from the vector store
    const chunks = await this.embeddingService.searchSimilar(
      training.title,
      5,
      [ChunkSource.EXTERNAL_COURSE, ChunkSource.COURSE_ANALYSIS],
    );
    const courseContent = chunks.length
      ? chunks.map((c) => c.content).join('\n')
      : lang === 'en'
        ? `Course: ${training.title}. Platform: ${training.platform?.name || 'N/A'}.`
        : `Curso: ${training.title}. Plataforma: ${training.platform?.name || 'N/A'}.`;

    // Load user profile for context
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { skills: true },
    });

    const userProfile = {
      userFunction: user?.userFunction ?? undefined,
      experienceLevel: user?.experienceLevel ?? undefined,
      skills: user?.skills?.map((s) => `${s.skillName}(${s.level})`).join(', '),
    };

    const prompt = buildCoursePlanPrompt(
      training.title,
      courseContent,
      userProfile,
      training.notes ?? null,
      training.progressLevel ?? null,
      focus,
      lang,
    );

    const rawResponse = await this.aiService.generateText(prompt, {
      userId,
      language: lang as 'pt' | 'en',
      maxTokens: 2000,
      temperature: 0.2,
      responseFormat: 'json_object',
      noCache: true,
    });

    const plan = JsonSafeParser.parse(rawResponse, CoursePlanSchema);

    if (!plan) {
      this.logger.error(
        `Falha na validação do plano para training ${trainingId}`,
      );
      return this.getFallbackPlan(training.title, lang, trainingId);
    }

    const result: CoursePlanResponse = {
      trainingId,
      courseTitle: training.title,
      ...plan,
    };

    // Guardar no cache
    await this.cacheService.set(
      cacheKey,
      JSON.stringify(result),
      PLAN_CACHE_TTL,
    );

    return result;
  }

  private async getUserLanguage(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    return settings?.uiLanguage || 'pt';
  }

  private getFallbackPlan(
    courseTitle: string,
    lang: string,
    trainingId: string,
  ): CoursePlanResponse {
    const isEn = lang === 'en';
    return {
      trainingId,
      courseTitle,
      overview: isEn
        ? 'A structured plan could not be generated at this time. Please try again later.'
        : 'Não foi possível gerar um plano estruturado neste momento. Tenta novamente mais tarde.',
      prerequisites: [],
      learningPath: [],
      keyObjectives: [],
      studyTips: [],
      totalEstimatedTime: isEn ? 'N/A' : 'N/D',
      afterCompletion: isEn ? 'N/A' : 'N/D',
    };
  }
}
