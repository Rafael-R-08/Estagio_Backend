import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RagService, RagResponse } from '../rag/rag.service';
import { AiSettings } from '../rag/prompt-templates/default.template';

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

    // 1. Buscar dados completos do utilizador (perfil + settings em paralelo)
    const [user, settings] = await Promise.all([
      this.prisma.user.findUnique({
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
      }),
      this.prisma.userSettings.findUnique({ where: { userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('Utilizador não encontrado');
    }

    // 2. Extrair preferências de IA das settings (com defaults seguros)
    const aiSettings: AiSettings = {
      aiResponseDetail: settings?.aiResponseDetail ?? null,
      aiResponseLanguage: settings?.aiResponseLanguage ?? null,
      aiExplainReasoning: settings?.aiExplainReasoning ?? false,
      aiRecommendationMode: settings?.aiRecommendationMode ?? null,
    };
    const useHistory = settings?.aiCanUseHistory ?? true;

    this.logger.log(
      `Settings do utilizador - detalhe: ${aiSettings.aiResponseDetail}, ` +
      `língua: ${aiSettings.aiResponseLanguage}, ` +
      `modo: ${aiSettings.aiRecommendationMode}, ` +
      `usar histórico: ${useHistory}`,
    );

    // 3. Construir query enriquecida se não foi fornecida
    const enrichedQuery =
      query ||
      this.buildDefaultQuery(
        user.techStack,
        user.interests,
        user.preferences?.learningGoals ?? [],
      );

    // 4. Construir perfil para o RAG
    const completedTrainings = useHistory && user.trainings
      ? user.trainings.filter(t => t.status === 'completed').map(t => t.title)
      : [];

    const userProfile = {
      techStack: user.techStack,
      interests: user.interests,
      experienceLevel: user.experienceLevel ?? 'não definido',
      completedTrainings,
    };

    // 5. Histórico de treinos completo (para contexto visual/logging)
    const trainingContext = useHistory
      ? this.buildTrainingContext(user.trainings ?? [])
      : '';

    // 6. Chamar o RAG com o contexto completo e as settings de IA
    // topK=2 para evitar injetar demasiado texto no prompt num CPU
    const ragResponse = await this.ragService.recommend(
      enrichedQuery,
      userProfile,
      2,
      aiSettings,
    );

    // 7. Enriquecer a resposta com o histórico (se permitido)
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
