// src/ai/services/recommendation.service.ts 
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service.js';
import { ChunkSource, TrainingStatus } from '@prisma/client';
import { buildRecommendationPrompt } from '../templates/rag.template.js';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
  ) {}

  /**
   * Pipeline de recomendação principal que utiliza RAG e feedback histórico.
   */
  async recommendForUser(userId: string) {
    this.logger.log(`Gerando recomendações personalizadas para o utilizador: ${userId}`);

    // 1. Carregar perfil do utilizador com settings e preferências (conforme schema)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { 
        settings: true,
        preferences: true
      }
    });

    if (!user) throw new NotFoundException('Utilizador não encontrado');

    // 2. Carregar registos de treino (TrainingRecord NÃO tem relação course no schema)
    const trainings = await this.prisma.trainingRecord.findMany({
      where: { userId },
      include: { platform: true }
    });

    // Mapear categorias usando TrainingStatus real (minusculas)
    const categories = {
      completed: trainings.filter(t => t.status === TrainingStatus.completed).map(t => t.title),
      ongoing: trainings.filter(t => t.status === TrainingStatus.ongoing).map(t => t.title),
      accessed: trainings.filter(t => t.status === TrainingStatus.accessed).map(t => t.title),
      priority: trainings.filter(t => t.status === TrainingStatus.priority).map(t => t.title),
    };

    // 3. Construir query RAG baseada em objetivos e histórico
    // learningGoals está em preferences no schema REAL
    const learningGoals = user.preferences?.learningGoals?.join(', ') || '';
    const ragQuery = `Cursos recomendados para ${user.jobTitle || 'colaborador'} focados em ${learningGoals}. Histórico: ${categories.completed.slice(0, 3).join(', ')}`;

    // 4. Chamar RagService com fontes filtradas para obter contexto inicial
    const resultContext = await this.ragService.query(ragQuery, {
      topK: 12,
      maxContextLength: 4000,
      sourceFilter: [ChunkSource.EXTERNAL_COURSE, ChunkSource.SOFTINSA_LEARNING],
      // No systemPrompt aqui, pois será construído com o resultado do RAG
      generateOptions: {
        userId,
        maxTokens: 1500,
        temperature: 0.4,
        cacheTtl: 1800
      }
    });

    // 5. Preparar Prompt via Template
    const systemPrompt = buildRecommendationPrompt(
      {
        techStack: user.techStack || [],
        interests: user.interests || [],
        experienceLevel: user.experienceLevel || 'N/A',
        learningGoals: user.preferences?.learningGoals || [],
        completedTrainings: categories.completed,
        serviceLine: user.serviceLine || undefined,
      },
      resultContext.answer, // Usamos o contexto recuperado pelo RAG
      ragQuery,
      {
        aiResponseDetail: user.settings?.aiResponseDetail,
        aiResponseLanguage: user.settings?.aiResponseLanguage,
        aiExplainReasoning: user.settings?.aiExplainReasoning,
        aiRecommendationMode: user.settings?.aiRecommendationMode,
      }
    );

    // 6. Chamar RagService novamente com o prompt personalizado
    const finalResult = await this.ragService.query(ragQuery, {
      topK: 12, // Pode ser ajustado se o primeiro RAG já trouxe bons resultados
      maxContextLength: 4000,
      sourceFilter: [ChunkSource.EXTERNAL_COURSE, ChunkSource.SOFTINSA_LEARNING],
      systemPrompt: systemPrompt,
      generateOptions: {
        userId,
        maxTokens: 1500,
        temperature: 0.4,
        cacheTtl: 1800
      }
    });

    let recommendations: any = finalResult.answer;
    
    // Tentar fazer parse do JSON se a resposta parecer um objeto
    if (finalResult.answer.trim().startsWith('{')) {
      try {
        // Limpar possíveis blocos de código markdown ```json ... ```
        const jsonContent = finalResult.answer.replace(/```json\n?|```/g, '').trim();
        recommendations = JSON.parse(jsonContent);
      } catch (e) {
        this.logger.warn('Falha ao parsear recomendações JSON, mantendo como string');
      }
    }

    return {
      recommendations,
      metadata: {
        sourcesLength: finalResult.sources.length,
        timestamp: new Date().toISOString(),
        chunksUsed: finalResult.sources.map(s => s.id)
      }
    };
  }

  // Métodos buildProfileContext e buildSystemPrompt removidos em favor do template centralizado

  /**
   * Guarda feedback seguindo o schema corrigido (relação com User)
   */
  async saveFeedback(userId: string, dto: any) {
    return this.prisma.recommendationFeedback.create({
      data: {
        userId,
        recommendationText: dto.recommendationText,
        rating: dto.rating,
        courseClicked: dto.courseClicked || false,
        courseEnrolled: dto.courseEnrolled || false,
        metadata: dto.metadata || {}
      }
    });
  }
}
