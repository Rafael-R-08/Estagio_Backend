import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import { buildSlManagerDigestEmail } from '../templates/email-templates';

// Every Monday at 08:30 (30 min after the user recommendations cron)
const SLM_DIGEST_CRON = '30 8 * * 1';

@Injectable()
export class SlManagerDigestScheduler {
  private readonly logger = new Logger(SlManagerDigestScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(SLM_DIGEST_CRON)
  async sendManagerDigests(): Promise<void> {
    this.logger.log('[Cron] A gerar digests semanais para SL Managers...');
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all active SL Managers with a managed line
    const managers = await this.prisma.user.findMany({
      where: {
        role: Role.SERVICE_LINE_MANAGER,
        isActive: true,
        managedLineId: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        managedLineId: true,
        settings: true,
      },
    });

    this.logger.log(`[Cron] SL Managers encontrados: ${managers.length}`);

    for (const manager of managers) {
      if (!manager.managedLineId) continue;

      try {
        const lineId = manager.managedLineId;

        const [
          totalMembers,
          activeMembers,
          completedLast30Days,
          ongoing,
          expiringCerts,
        ] = await Promise.all([
          this.prisma.user.count({ where: { serviceLine: lineId } }),
          this.prisma.user.count({
            where: { serviceLine: lineId, isActive: true },
          }),
          this.prisma.trainingRecord.count({
            where: {
              status: 'completed',
              completedAt: { gte: thirtyDaysAgo },
              user: { serviceLine: lineId },
            },
          }),
          this.prisma.trainingRecord.count({
            where: { status: 'ongoing', user: { serviceLine: lineId } },
          }),
          this.prisma.certificate.count({
            where: {
              status: 'COMPLETED',
              expirationDate: { gte: now, lte: in90Days },
              user: { serviceLine: lineId },
            },
          }),
        ]);

        const stats = {
          totalMembers,
          activeMembers,
          completedLast30Days,
          ongoing,
          expiringCerts,
        };
        const lineName = lineId.replace(/_/g, ' ');

        // In-app notification
        if (!manager.settings || manager.settings.notifyInApp) {
          await this.notificationsService.create({
            userId: manager.id,
            type: NotificationType.GENERAL,
            title: `Resumo semanal — ${lineName}`,
            body: `${activeMembers} membros ativos · ${completedLast30Days} formações concluídas (30d)${expiringCerts > 0 ? ` · ⚠️ ${expiringCerts} certificados a expirar` : ''}`,
            metadata: stats,
          });
        }

        // Email
        if (!manager.settings || manager.settings.notifyByEmail) {
          const { subject, html, text } = buildSlManagerDigestEmail(
            manager.name ?? '',
            lineName,
            stats,
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: manager.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha ao enviar digest para ${manager.email}: ${(err as Error).message}`,
              ),
            );
        }
      } catch (error) {
        this.logger.error(
          `[Cron] Erro ao gerar digest para managerId=${manager.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    this.logger.log('[Cron] Digests de SL Managers concluídos.');
  }
}
