import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { ProcessingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { CertificateProcessedEvent } from '../events/certificate-processed.event';
import {
  buildCertificateCompletedEmail,
  buildCertificateFailedEmail,
} from '../templates/email-templates';

@Injectable()
export class CertificateNotificationListener {
  private readonly logger = new Logger(CertificateNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('certificate.processed')
  async handleCertificateProcessed(
    event: CertificateProcessedEvent,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: event.userId },
        select: { email: true, name: true, settings: true },
      });
      if (!user) return;

      const settings = user.settings;
      const isCompleted = event.status === ProcessingStatus.COMPLETED;

      // In-app notification (if user has notifyInApp enabled or no settings yet)
      if (!settings || settings.notifyInApp) {
        await this.notificationsService.create({
          userId: event.userId,
          type: 'CERTIFICATE_PROCESSED',
          title: isCompleted
            ? `Certificado processado: ${event.courseName}`
            : `Erro ao processar certificado: ${event.courseName}`,
          body: isCompleted
            ? 'Os metadados foram extraídos e o seu registo foi atualizado.'
            : `Ocorreu um erro ao processar o certificado. Tente submeter novamente.`,
          metadata: { certificateId: event.certificateId },
        });
      }

      // Email notification
      if (!settings || (settings.notifyByEmail && settings.notifyProgress)) {
        const frontendUrl =
          this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
        const { subject, html, text } = isCompleted
          ? buildCertificateCompletedEmail(
              user.name ?? '',
              event.courseName,
              frontendUrl,
            )
          : buildCertificateFailedEmail(
              user.name ?? '',
              event.courseName,
              frontendUrl,
            );

        await this.emailService.sendMail({
          to: user.email,
          subject,
          html,
          text,
        });
      }
    } catch (error) {
      this.logger.error(
        `Erro ao enviar notificação de certificado para userId=${event.userId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
