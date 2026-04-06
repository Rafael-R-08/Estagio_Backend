import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { buildOnboardingReminderEmail } from '../templates/email-templates';

// Run every day at 10:00
const ONBOARDING_CRON = '0 10 * * *';
// Send reminder X days after registration if onboarding still not done
const REMINDER_DAYS = [3, 7];

@Injectable()
export class OnboardingReminderScheduler {
  private readonly logger = new Logger(OnboardingReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(ONBOARDING_CRON)
  async checkIncompleteOnboarding(): Promise<void> {
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    const now = new Date();

    // Find users who registered 3 or 7 days ago and still haven't done onboarding
    for (const days of REMINDER_DAYS) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - days);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const users = await this.prisma.user.findMany({
        where: {
          onboardingDone: false,
          isActive: true,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        select: {
          id: true,
          email: true,
          name: true,
          settings: true,
        },
      });

      if (users.length === 0) continue;

      this.logger.log(
        `[Cron] Onboarding incompleto (${days}d): ${users.length} utilizador(es)`,
      );

      for (const user of users) {
        const settings = user.settings;

        try {
          // Check if we already sent a reminder in the last 48h
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
          const alreadySent = await this.prisma.notification.findFirst({
            where: {
              userId: user.id,
              type: NotificationType.GENERAL,
              createdAt: { gte: twoDaysAgo },
              title: { contains: 'perfil' },
            },
          });
          if (alreadySent) continue;

          // In-app
          if (!settings || settings.notifyInApp) {
            await this.notificationsService.create({
              userId: user.id,
              type: NotificationType.GENERAL,
              title: 'Completa o teu perfil',
              body: 'O teu perfil ainda está incompleto. Completa-o para receber recomendações de formação personalizadas.',
              metadata: { daysSinceRegister: days },
            });
          }

          // Email
          if (!settings || settings.notifyByEmail) {
            const { subject, html, text } = buildOnboardingReminderEmail(
              user.name ?? '',
              frontendUrl,
            );
            await this.emailService
              .sendMail({ to: user.email, subject, html, text })
              .catch((err) =>
                this.logger.warn(
                  `Falha ao enviar lembrete de onboarding para ${user.email}: ${(err as Error).message}`,
                ),
              );
          }
        } catch (error) {
          this.logger.error(
            `[Cron] Erro ao enviar lembrete de onboarding para userId=${user.id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }
    }
  }
}
