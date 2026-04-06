import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { buildCertificateExpiringEmail } from '../templates/email-templates';

// Days before expiry to send the first alert
const EXPIRY_ALERT_DAYS = [30, 7];

@Injectable()
export class CertificateExpiryScheduler {
  private readonly logger = new Logger(CertificateExpiryScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkExpiringCertificates(): Promise<void> {
    this.logger.log('[Cron] A verificar certificados a expirar...');
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';

    try {
      const maxDays = Math.max(...EXPIRY_ALERT_DAYS);
      const now = new Date();
      const future = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);

      // Load all expiring certs with user settings in one query
      const certificates = await this.prisma.certificate.findMany({
        where: {
          expirationDate: { gte: now, lte: future },
          status: 'COMPLETED',
          user: { isActive: true },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              settings: true,
            },
          },
        },
      });

      if (certificates.length === 0) {
        this.logger.debug('[Cron] Nenhum certificado a expirar encontrado.');
        return;
      }

      // Group by userId
      const byUser = new Map<string, typeof certificates>();
      for (const cert of certificates) {
        const userId = cert.user.id;
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId)!.push(cert);
      }

      for (const [userId, userCerts] of byUser) {
        const user = userCerts[0].user;
        const settings = user.settings;

        // Respect user preferences
        if (settings && !settings.notifyCertExpiry) continue;

        // Filter certs at alert thresholds (30d or 7d) and deduplicate
        const certsToNotify = await this.filterCertsNeedingAlert(
          userId,
          userCerts,
          now,
        );
        if (certsToNotify.length === 0) continue;

        // In-app notifications
        if (!settings || settings.notifyInApp) {
          for (const cert of certsToNotify) {
            const daysLeft = Math.ceil(
              (cert.expirationDate!.getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            await this.notificationsService.create({
              userId,
              type: NotificationType.CERTIFICATE_EXPIRING,
              title: `Certificado a expirar: ${cert.courseName}`,
              body: `O certificado "${cert.courseName}" expira em ${daysLeft} dias.`,
              metadata: { certificateId: cert.id, daysLeft },
            });
          }
        }

        // Email notification (one email per user, listing all expiring certs)
        if (!settings || settings.notifyByEmail) {
          const certsSummary = certsToNotify.map((c) => ({
            courseName: c.courseName ?? 'Certificado',
            expirationDate: c.expirationDate!,
          }));
          const { subject, html, text } = buildCertificateExpiringEmail(
            user.name ?? '',
            certsSummary,
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha ao enviar alerta de expiração para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }

        this.logger.log(
          `[Cron] Alertas de expiração enviados para userId=${userId} (${certsToNotify.length} certificados)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[Cron] Erro ao verificar certificados a expirar: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Returns only certs that are within an alert threshold (30d or 7d)
   * and haven't had a CERTIFICATE_EXPIRING notification in the last 5 days.
   */
  private async filterCertsNeedingAlert(
    userId: string,
    certs: {
      id: string;
      expirationDate: Date | null;
      courseName: string | null;
    }[],
    now: Date,
  ) {
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Load recently sent expiry notifications for this user
    const recentNotifications = await this.prisma.notification.findMany({
      where: {
        userId,
        type: NotificationType.CERTIFICATE_EXPIRING,
        createdAt: { gte: fiveDaysAgo },
      },
      select: { metadata: true },
    });

    const recentlySentIds = new Set(
      recentNotifications
        .map(
          (n) =>
            (n.metadata as { certificateId?: string } | null)?.certificateId,
        )
        .filter(Boolean) as string[],
    );

    return certs.filter((cert) => {
      if (!cert.expirationDate) return false;
      if (recentlySentIds.has(cert.id)) return false;

      const daysLeft = Math.ceil(
        (cert.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      return EXPIRY_ALERT_DAYS.some((threshold) => daysLeft <= threshold);
    });
  }
}
