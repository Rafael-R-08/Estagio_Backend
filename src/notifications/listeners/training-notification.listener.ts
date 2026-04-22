import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import {
  TrainingCompletedEvent,
  TrainingCreatedEvent,
  TrainingStartedEvent,
} from '../events/training.events';
import { buildTrainingCompletedEmail } from '../templates/email-templates';

@Injectable()
export class TrainingNotificationListener {
  private readonly logger = new Logger(TrainingNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('training.completed')
  async handleTrainingCompleted(event: TrainingCompletedEvent): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { email: true, name: true, settings: true },
      });
      if (!user) return;

      const settings = user.settings;

      // In-app notification
      if (!settings || settings.notifyInApp) {
        await this.notificationsService.create({
          userId: event.userId,
          type: NotificationType.TRAINING_COMPLETED,
          title: `Formação concluída: ${event.title}`,
          body: 'Parabéns! Não te esqueças de submeter o certificado.',
          metadata: { trainingId: event.trainingId },
        });
      }

      // Email notification
      if (!settings || (settings.notifyByEmail && settings.notifyProgress)) {
        const frontendUrl =
          this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
        const { subject, html, text } = buildTrainingCompletedEmail(
          user.name ?? '',
          event.title,
          frontendUrl,
        );
        await this.emailService
          .sendMail({ to: user.email, subject, html, text })
          .catch((err) =>
            this.logger.warn(
              `Falha ao enviar email de formação concluída para ${user.email}: ${(err as Error).message}`,
            ),
          );
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar training.completed para userId=${event.userId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent('training.created')
  async handleTrainingCreated(event: TrainingCreatedEvent): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { settings: true },
      });
      if (!user) return;

      const settings = user.settings;

      // In-app only — no email for plan additions (low noise preference)
      if (!settings || settings.notifyInApp) {
        await this.notificationsService.create({
          userId: event.userId,
          type: NotificationType.GENERAL,
          title: `Formação adicionada: ${event.title}`,
          body: 'A formação foi adicionada ao teu plano de aprendizagem.',
          metadata: { trainingId: event.trainingId },
        });
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar training.created para userId=${event.userId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent('training.started')
  async handleTrainingStarted(event: TrainingStartedEvent): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { settings: true },
      });
      if (!user) return;

      const settings = user.settings;

      if (!settings || settings.notifyInApp) {
        await this.notificationsService.create({
          userId: event.userId,
          type: NotificationType.TRAINING_STARTED,
          title: `Formação iniciada: ${event.title}`,
          body: 'Boa sorte! A formação foi marcada como em curso.',
          metadata: { trainingId: event.trainingId },
        });
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar training.started para userId=${event.userId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
