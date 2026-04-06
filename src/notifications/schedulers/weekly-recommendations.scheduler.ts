import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { RecommendationService } from '../../ai/services/recommendation.service';
import { buildWeeklyRecommendationsEmail } from '../templates/email-templates';

// Every Monday at 08:00
const WEEKLY_CRON = '0 8 * * 1';

@Injectable()
export class WeeklyRecommendationsScheduler {
  private readonly logger = new Logger(WeeklyRecommendationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly recommendationService: RecommendationService,
    private readonly config: ConfigService,
  ) {}

  @Cron(WEEKLY_CRON)
  async sendWeeklyRecommendations(): Promise<void> {
    this.logger.log('[Cron] A gerar recomendações semanais...');
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';

    // Fetch all users that opted-in to weekly recommendations
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        onboardingDone: true,
        settings: { notifyWeeklyRecs: true },
      },
      select: {
        id: true,
        email: true,
        name: true,
        settings: true,
      },
    });

    this.logger.log(
      `[Cron] Utilizadores elegíveis para recomendações semanais: ${users.length}`,
    );

    for (const user of users) {
      try {
        const result = await this.recommendationService.recommendForUser(
          user.id,
        );

        if (!result.courses || result.courses.length === 0) {
          this.logger.debug(`[Cron] Sem recomendações para userId=${user.id}`);
          continue;
        }

        // In-app notification
        if (!user.settings || user.settings.notifyInApp) {
          await this.notificationsService.create({
            userId: user.id,
            type: NotificationType.WEEKLY_RECOMMENDATION,
            title: 'As tuas recomendações semanais estão prontas',
            body:
              result.summary ||
              `Temos ${result.courses.length} novas formações recomendadas para ti.`,
            metadata: { courseCount: result.courses.length },
          });
        }

        // Email
        if (!user.settings || user.settings.notifyByEmail) {
          const { subject, html, text } = buildWeeklyRecommendationsEmail(
            user.name ?? '',
            result.courses,
            result.summary || '',
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha ao enviar recomendações para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }
      } catch (error) {
        this.logger.error(
          `[Cron] Erro ao gerar recomendações para userId=${user.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        // Continue to next user even if one fails
      }
    }

    this.logger.log('[Cron] Recomendações semanais concluídas.');
  }
}
