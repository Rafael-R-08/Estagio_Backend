import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService, RagResponse } from '../rag/rag.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RagService,
  ) {}

  /**
   * Gera recomendações personalizadas para o utilizador autenticado.
   * Vai buscar automaticamente à BD:
   * - perfil (techStack, interests, experienceLevel)
   * - histórico de treinos (cursos já feitos)
   * - preferências (plataformas ativas, objetivos)
   */
  async recommendForUser(userId: string, query?: string): Promise<RagResponse> {
    this.logger.log(`Gerando recomendações para utilizador: ${userId}`);

    // 1. Buscar dados completos do utilizador
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        experienceLevel: true,
        techStack: true,
        interests: true,
        preferences: {
          select: {
            learningGoals: true,
            enabledPlatforms: true,
          },
        },
        trainings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            title: true,
            status: true,
            rating: true,
            platform: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilizador não encontrado');
    }

    // 2. Construir query enriquecida se não foi fornecida
    const enrichedQuery =
      query ||
      this.buildDefaultQuery(
        user.techStack,
        user.interests,
        user.preferences?.learningGoals ?? [],
      );

    // 3. Construir perfil para o RAG
    const userProfile = {
      techStack: user.techStack,
      interests: user.interests,
      experienceLevel: user.experienceLevel ?? 'não definido',
    };

    // 4. Construir contexto extra com histórico de treinos
    const trainingContext = this.buildTrainingContext(user.trainings ?? []);

    // 5. Chamar o RAG com o contexto completo
    // topK=4 para não sobrecarregar modelos pequenos (gemma2:2b)
    const ragResponse = await this.ragService.recommend(
      enrichedQuery,
      userProfile,
      4,
    );

    // 6. Enriquecer a resposta com o histórico
    return {
      ...ragResponse,
      answer: trainingContext
        ? `${ragResponse.answer}\n\n---\n_Histórico considerado: ${trainingContext}_`
        : ragResponse.answer,
    };
  }

  private buildDefaultQuery(
    techStack: string[],
    interests: string[],
    goals: string[],
  ): string {
    const parts: string[] = [];
    if (techStack.length > 0) parts.push(`tecnologias: ${techStack.join(', ')}`);
    if (interests.length > 0) parts.push(`interesses: ${interests.join(', ')}`);
    if (goals.length > 0) parts.push(`objetivos: ${goals.join(', ')}`);
    return parts.length > 0
      ? `Recomenda cursos e formações para alguém com ${parts.join('; ')}`
      : 'Recomenda cursos e formações relevantes para desenvolvimento profissional';
  }

  private buildTrainingContext(
    trainings: Array<{ title: string; status: string; rating?: number | null; platform?: { name: string } | null }>,
  ): string {
    if (trainings.length === 0) return '';
    return trainings
      .map(
        (t) =>
          `"${t.title}" (${t.platform?.name ?? 'plataforma desconhecida'}, estado: ${t.status}${t.rating ? `, avaliação: ${t.rating}/5` : ''})`,
      )
      .join(', ');
  }
}
