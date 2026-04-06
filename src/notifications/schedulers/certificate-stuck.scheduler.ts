import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { buildCertificateStuckEmail } from '../templates/email-templates';

// Check every hour for stuck jobs
const STUCK_CHECK_CRON = '0 * * * *';
// A certificate is considered stuck after this many minutes
const STUCK_THRESHOLD_MINUTES = 120;

@Injectable()
export class CertificateStuckScheduler {
  private readonly logger = new Logger(CertificateStuckScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(STUCK_CHECK_CRON)
  async checkStuckCertificates(): Promise<void> {
    const stuckThreshold = new Date(
      Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000,
    );

    const stuckCerts = await this.prisma.certificate.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        jobId: { not: null },
        createdAt: { lt: stuckThreshold },
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, email: true, name: true, settings: true } },
      },
    });

    if (stuckCerts.length === 0) return;

    this.logger.warn(
      `[Cron] Encontrados ${stuckCerts.length} certificado(s) preso(s) no processamento`,
    );

    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';

    for (const cert of stuckCerts) {
      const { user } = cert;
      const settings = user.settings;

      try {
        // Check if we already notified for this cert in the last 3 hours (avoid spam)
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const alreadyNotified = await this.prisma.notification.findFirst({
          where: {
            userId: user.id,
            type: NotificationType.CERTIFICATE_PROCESSED,
            createdAt: { gte: threeHoursAgo },
            metadata: { path: ['certificateId'], equals: cert.id },
          },
        });
        if (alreadyNotified) continue;

        // In-app
        if (!settings || settings.notifyInApp) {
          await this.notificationsService.create({
            userId: user.id,
            type: NotificationType.CERTIFICATE_PROCESSED,
            title: `Atraso no processamento: ${cert.courseName ?? 'Certificado'}`,
            body: 'O processamento está a demorar mais do que o esperado. Podes tentar submeter novamente.',
            metadata: { certificateId: cert.id, stuck: true },
          });
        }

        // Email
        if (!settings || (settings.notifyByEmail && settings.notifyProgress)) {
          const { subject, html, text } = buildCertificateStuckEmail(
            user.name ?? '',
            cert.courseName ?? 'Certificado',
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha ao notificar certificado preso para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }
      } catch (error) {
        this.logger.error(
          `[Cron] Erro ao notificar cert preso id=${cert.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }
}
