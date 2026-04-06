import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email.service';
import { NotificationsService } from '../notifications.service';
import {
  buildCalendarReminderEmail,
  CalendarReminderType,
} from '../templates/email-templates';

// ── Cron expressions ────────────────────────────────────────────────────────
// Daily at 09:00 → day-before + day-of digest
const DAILY_9AM = '0 9 * * *';
// Every 15 minutes → close-up "final" reminder
const EVERY_15_MINUTES = '*/15 * * * *';

@Injectable()
export class CalendarReminderScheduler {
  private readonly logger = new Logger(CalendarReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ── Daily 09:00: "day before" and "day of" ─────────────────────────────────

  @Cron(DAILY_9AM)
  async checkDailyReminders(): Promise<void> {
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(todayEnd);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    await Promise.all([
      this.sendBatchDailyReminders(todayStart, todayEnd, 'dayOf', frontendUrl),
      this.sendBatchDailyReminders(
        tomorrowStart,
        tomorrowEnd,
        'dayBefore',
        frontendUrl,
      ),
    ]);
  }

  private async sendBatchDailyReminders(
    rangeStart: Date,
    rangeEnd: Date,
    type: 'dayOf' | 'dayBefore',
    frontendUrl: string,
  ): Promise<void> {
    const notifiedField =
      type === 'dayOf' ? 'dayOfNotified' : 'dayBeforeNotified';

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        eventDate: { gte: rangeStart, lte: rangeEnd },
        [notifiedField]: false,
        user: { isActive: true },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, settings: true },
        },
      },
    });

    if (events.length === 0) return;
    this.logger.log(`[Cron] Calendário ${type}: ${events.length} evento(s)`);

    for (const event of events) {
      const { user } = event;
      const settings = user.settings;

      try {
        const inAppTitle =
          type === 'dayOf' ? `Hoje: ${event.title}` : `Amanhã: ${event.title}`;
        const inAppBody =
          type === 'dayOf'
            ? `O teu evento "${event.title}" é hoje às ${this.formatTime(event.eventDate)}.`
            : `O teu evento "${event.title}" é amanhã às ${this.formatTime(event.eventDate)}.`;

        if (!settings || settings.notifyInApp) {
          await this.notificationsService.create({
            userId: user.id,
            type: NotificationType.CALENDAR_REMINDER,
            title: inAppTitle,
            body: inAppBody,
            metadata: { calendarEventId: event.id, reminderType: type },
          });
        }

        if (!settings || settings.notifyByEmail) {
          const { subject, html, text } = buildCalendarReminderEmail(
            user.name ?? '',
            event.title,
            event.eventDate,
            type as CalendarReminderType,
            event.reminderMinutesBefore,
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha email calendário (${type}) para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }

        // Mark as notified
        await this.prisma.calendarEvent.update({
          where: { id: event.id },
          data: { [notifiedField]: true },
        });
      } catch (error) {
        this.logger.error(
          `[Cron] Erro calendário ${type} eventId=${event.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  // ── Every 15 min: close-up "final" reminder ────────────────────────────────

  @Cron(EVERY_15_MINUTES)
  async checkFinalReminders(): Promise<void> {
    const frontendUrl =
      this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 15 * 60 * 1000); // next 15 min

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        reminderFireAt: { gte: now, lte: windowEnd },
        finalReminderNotified: false,
        user: { isActive: true },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, settings: true },
        },
      },
    });

    if (events.length === 0) return;
    this.logger.log(
      `[Cron] Lembrete final calendário: ${events.length} evento(s)`,
    );

    for (const event of events) {
      const { user } = event;
      const settings = user.settings;

      try {
        if (!settings || settings.notifyInApp) {
          await this.notificationsService.create({
            userId: user.id,
            type: NotificationType.CALENDAR_REMINDER,
            title: `Em ${event.reminderMinutesBefore} min: ${event.title}`,
            body: `O teu evento "${event.title}" começa em ${event.reminderMinutesBefore} minutos (${this.formatTime(event.eventDate)}).`,
            metadata: { calendarEventId: event.id, reminderType: 'final' },
          });
        }

        if (!settings || settings.notifyByEmail) {
          const { subject, html, text } = buildCalendarReminderEmail(
            user.name ?? '',
            event.title,
            event.eventDate,
            'final',
            event.reminderMinutesBefore,
            frontendUrl,
          );
          await this.emailService
            .sendMail({ to: user.email, subject, html, text })
            .catch((err) =>
              this.logger.warn(
                `Falha email lembrete final para ${user.email}: ${(err as Error).message}`,
              ),
            );
        }

        await this.prisma.calendarEvent.update({
          where: { id: event.id },
          data: { finalReminderNotified: true },
        });
      } catch (error) {
        this.logger.error(
          `[Cron] Erro lembrete final eventId=${event.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
