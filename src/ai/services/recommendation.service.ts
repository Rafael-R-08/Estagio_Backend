import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { ChunkSource, TrainingStatus } from '@prisma/client';
import { buildRecommendationPrompt } from '../templates/rag.template';
import { IndexingSeedService } from './indexing-seed.service';
import { JsonSafeParser } from '../parsers/json-safe.parser';
import { RecommendationSchema, RecommendationOutput } from '../parsers/ai.schemas';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
    private indexingSeedService: IndexingSeedService,
  ) {}

  /**
   * Gera recomendações personalizadas ultra-precisas usando RAG + Perfil Rico.
   */
  async recommendForUser(userId?: string): Promise<RecommendationOutput & { metadata: any }> {
    this.logger.log(`Gerando recomendações enterprise para: ${userId || 'Anónimo'}`);

    if (!userId) {
      return {
        ...this.getFallbackRecommendations('pt'),
        metadata: { info: 'Anonymous recommendation', sources: 0 }
      };
    }

    // 1. Garantir que o Vector Store não está vazio
    const count = await this.prisma.textChunk.count();
    if (count === 0) {
      this.logger.warn('Base vazia. Indexando...');
      await this.indexingSeedService.seedFromExistingData();
    }

    // 2. Carregar Perfil Completo do Utilizador
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        skills: true,
        settings: true,
        trainings: {
          select: { title: true, status: true }
        }
      }
    });

    if (!user) {
      return {
        ...this.getFallbackRecommendations('pt'),
        metadata: { info: 'User not found', sources: 0 }
      };
    }

    const lang = user.settings?.uiLanguage || 'pt';
    const completed = user.trainings.filter(t => t.status === TrainingStatus.completed).map(t => t.title);
    const ongoing = user.trainings.filter(t => t.status === TrainingStatus.ongoing).map(t => t.title);

    // 3. Query RAG Otimizada
    const interestsStr = user.interests?.join(', ') || 'TI Geral';
    const skillsStr = user.skills?.map(s => `${s.skillName} (${s.level})`).join(', ') || 'Nenhuma definida';
    
    const ragQuery = lang === 'en' 
      ? `Best courses for a ${user.userFunction} specialized in ${user.serviceLine}. Interests: ${interestsStr}. current skills: ${skillsStr}.`
      : `Melhores cursos para um ${user.userFunction} da área ${user.serviceLine}. Interesses: ${interestsStr}. Skills atuais: ${skillsStr}.`;

    // 4. Construir Prompt com Chain-of-Thought
    const systemPrompt = buildRecommendationPrompt(
      {
        interests: user.interests || [],
        experienceLevel: user.experienceLevel || 'juvenil',
        completedTrainings: completed,
        ongoingTrainings: ongoing,
        serviceLine: user.serviceLine?.toString(),
        userFunction: user.userFunction || 'Colaborador',
        skills: user.skills.map(s => ({ skillName: s.skillName, level: s.level })),
      },
      '', // Contexto injetado pelo RAG
      ragQuery,
      lang
    );

    // 5. Executar RAG com Groq JSON Mode
    const finalResult = await this.ragService.query(ragQuery, {
      topK: 12,
      sourceFilter: [ChunkSource.EXTERNAL_COURSE],
      systemPrompt,
      generateOptions: {
        userId,
        language: lang as 'pt' | 'en',
        maxTokens: 2000,
        temperature: 0.2, // Baixa temperatura para precisão JSON
        responseFormat: 'json_object',
      },
    });

    // 6. Parsing e Validação Robusta com Zod
    const recommendations = JsonSafeParser.parse(finalResult.answer, RecommendationSchema);

    if (!recommendations) {
      this.logger.error('Falha na validação das recomendações. Retornando fallback amigável.');
      return {
        ...this.getFallbackRecommendations(lang),
        metadata: { error: 'Validation failed', sources: finalResult.sources.length }
      };
    }

    return {
      ...recommendations,
      metadata: {
        sourcesCount: finalResult.sources.length,
        qualityScore: finalResult.qualityScore,
        timestamp: new Date().toISOString(),
      }
    };
  }

  private getFallbackRecommendations(lang: string): RecommendationOutput {
    return lang === 'en' ? {
      improvement: "Explore cloud and AI leadership courses to boost your career.",
      interests: "Focus on your declared interests to find relevant paths.",
      missing_skills: "Technical certifications in your field are highly recommended."
    } : {
      improvement: "Explora cursos de liderança em cloud e IA para impulsionar a tua carreira.",
      interests: "Foca-te nos teus interesses declarados para encontrar caminhos relevantes.",
      missing_skills: "Certificações técnicas na tua área são altamente recomendadas."
    };
  }
}
