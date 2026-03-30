// src/ai/services/recommendation.service.ts 
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { ChunkSource, TrainingStatus } from '@prisma/client';
import { buildRecommendationPrompt } from '../templates/rag.template';
import { IndexingSeedService } from './indexing-seed.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
    private configService: ConfigService,
    private indexingSeedService: IndexingSeedService,
  ) {}

  async recommendForUser(userId: string) {
    this.logger.log(`Gerando recomendações personalizadas para o utilizador: ${userId}`);

    const count = await this.prisma.textChunk.count();
    if (count === 0) {
      this.logger.warn('Base de conhecimento vazia detectada. Iniciando indexação...');
      this.indexingSeedService.seedFromExistingData().catch(e => this.logger.error('Falha na indexação', e));
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        skills: true,
      }
    });

    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const trainings = await this.prisma.trainingRecord.findMany({
      where: { userId },
    });

    const categories = {
      completed: trainings.filter(t => t.status === TrainingStatus.completed).map(t => t.title),
      ongoing: trainings.filter(t => t.status === TrainingStatus.ongoing).map(t => t.title),
    };

    // 1. Obter idioma do utilizador
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    const lang = settings?.uiLanguage || 'pt';
    const isEn = lang === 'en';

    const learningInterests = user.interests?.join(', ') || '';
    const skillsStr = user.skills?.map(s => s.skillName).join(', ') || '';
    
    const ragQuery = isEn 
      ? `Recommendations for ${user.userFunction || 'Employee'} (${user.serviceLine || 'General'}). Interests: ${learningInterests}. Skills: ${skillsStr}.`
      : `Recomendações para ${user.userFunction || 'Colaborador'} (${user.serviceLine || 'Geral'}). Interesses: ${learningInterests}. Skills: ${skillsStr}.`;

    // 2. Prompt enriquecido bilingue
    const systemPrompt = buildRecommendationPrompt(
      {
        interests: user.interests || [],
        experienceLevel: user.experienceLevel || 'N/A',
        completedTrainings: categories.completed,
        ongoingTrainings: categories.ongoing,
        serviceLine: user.serviceLine?.toString() || undefined,
        userFunction: user.userFunction || undefined,
        skills: user.skills.map(s => ({
          skillName: s.skillName,
          level: s.level,
          yearsOfExperience: s.yearsOfExperience
        })),
      },
      "", // Contexto preenchido pelo RAG
      ragQuery,
      lang
    );

    // 3. Chamada ao RAG com idioma e Llama 3.3
    const finalResult = await this.ragService.query(ragQuery, {
      topK: 10,
      maxContextLength: 3500,
      sourceFilter: [ChunkSource.EXTERNAL_COURSE],
      systemPrompt: systemPrompt,
      generateOptions: {
        userId,
        language: lang as 'pt' | 'en',
        maxTokens: 1500,
        temperature: 0.1, // Rigor para JSON
        cacheTtl: 3600,
        responseFormat: 'json_object',
      },
      model: 'llama-3.3-70b-versatile',
    });

    let recommendations: any = {
      interests: "Não foi possível gerar recomendações no momento.",
      improvement: "Não foi possível gerar recomendações de melhoria.",
      missing_skills: "Não foi possível gerar recomendações de novas competências."
    };
    
    const trimmedAnswer = finalResult.answer.trim();
    if (trimmedAnswer.includes('{')) {
      try {
        const startIdx = trimmedAnswer.indexOf('{');
        const endIdx = trimmedAnswer.lastIndexOf('}') + 1;
        let jsonContent = trimmedAnswer.substring(startIdx, endIdx);
        jsonContent = jsonContent.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(jsonContent);
        recommendations = { ...recommendations, ...parsed };
      } catch (e) {
        this.logger.warn(`Falha ao parsear JSON. Erro: ${e.message}`);
        recommendations.interests = finalResult.answer;
      }
    } else {
      recommendations.interests = finalResult.answer;
    }

    return {
      ...recommendations,
      metadata: {
        sourcesLength: finalResult.sources.length,
        timestamp: new Date().toISOString(),
      }
    };
  }
}
