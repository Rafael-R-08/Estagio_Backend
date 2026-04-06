import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { buildTrainingStagnationEmail } from '../templates/email-templates';

// Every Monday at 09:00 (after expiry and before recommendations)
const STAGNATION_CRON = '0 9 * * 1';
const STAGNATION_DAYS = 30;

@Injectable()
export class TrainingStagnationScheduler {
  private readonly logger = new Logger(TrainingStagnationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(STAGNATION_CRON)
  async checkStagnantTrainings(): Promise<void> {
    this.logger.log('[Cron] A verificar formações paradas...');
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    const threshold = new Date(
      Date.now() - STAGNATION_DAYS * 24 * 60 * 60 * 1000,
    );
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Trainings that have been "ongoing" for more than 30 days without completion
    const stagnantTrainings = await this.prisma.trainingRecord.findMany({
      where: {
        status: 'ongoing',
        startedAt: { lt: threshold },
        completedAt: null,
        user: { isActive: true, onboardingDone: true },
      },
      include: {
        user: { select: { id: true, email: true, name: true, settings: true } },
      },
    });

    if (stagnantTrainings.length === 0) {
      this.logger.debug('[Cron] Nenhuma formação parada encontrada.');
      return;
    }

    // Group by userId
    const byUser = new Map<string, typeof stagnantTrainings>();
    for (const t of stagnantTrainings) {
      if (!byUser.has(t.userId)) byUser.set(t.userId, []);
      byUser.get(t.userId)!.push(t);
    }

    for (const [userId, trainings] of byUser) {
      const user = trainings[0].user;
      const settings = user.settings;

      if (!settings || settings.notifyProgress === false) continue;

      // Avoid sending more than once every 2 weeks
      const recentNudge = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: NotificationType.GENERAL,
          createdAt: { gte: twoWeeksAgo },
          title: { contains: 'formação' },
        },
      });
      if (recentNudge) continue;

      try {
        const trainingList = trainings.map((t) => ({
          title: t.title,
          startedAt: t.startedAt!,
        }));

        // In-app
        if (!settings || settings.notifyInApp) {
          await this.notificationsService.create({
            userId,
            type: NotificationType.GENERAL,
            title: `Tens ${trainings.length} formação(ões) em curso há mais de ${STAGNATION_DAYS} dias`,
            body: 'Retoma a tua aprendizagem para não perderes o fio condutor.',
            metadata: { trainingIds: trainings.map((t) => t.id) },
          });
        }

        // Email
        if (!settings || settings.notifyByEmail) {
          const { subject, html, text } = buildTrainingStagnationEmail(
            user.name ?? '',
            trainingList,
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha ao enviar lembrete de formação parada para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }

        this.logger.log(
          `[Cron] Lembrete de formação parada enviado para userId=${userId}`,
        );
      } catch (error) {
        this.logger.error(
          `[Cron] Erro ao processar stagnation para userId=${userId}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }
}
