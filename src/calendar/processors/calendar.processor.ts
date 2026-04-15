import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../notifications/email.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import {
  buildCalendarReminderEmail,
  CalendarReminderType,
} from '../../notifications/templates/email-templates';
import { NotificationType } from '@prisma/client';

export type ReminderJobType = 'dayBefore' | 'dayOf' | 'final';

export interface CalendarReminderJobData {
  eventId: string;
  type: ReminderJobType;
}

@Processor('calendar-reminders')
export class CalendarProcessor extends WorkerHost {
  private readonly logger = new Logger(CalendarProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<CalendarReminderJobData>): Promise<any> {
    const { eventId, type } = job.data;
    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? 'http://localhost:4200';

    this.logger.log(`Processando job de calendário: eventId=${eventId}, tipo=${type}`);

    // 1. Buscar evento e user
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id: eventId },
      include: {
        user: {
          select: { id: true, name: true, email: true, settings: true, isActive: true },
        },
      },
    });

    // Se o evento foi eliminado entretanto
    if (!event) {
      this.logger.warn(`Evento ${eventId} não encontrado. Abortando notificação.`);
      return;
    }

    // Se o utilizador já não está ativo
    if (!event.user.isActive) {
      this.logger.warn(`Utilizador ${event.user.id} inativo. Abortando notificação.`);
      return;
    }

    const { user } = event;
    const settings = user.settings;

    try {
      // 2. Notificação In-App
      if (!settings || settings.notifyInApp) {
        const inAppTitle = this.getInAppTitle(type, event.title, event.reminderMinutesBefore);
        const inAppBody = this.getInAppBody(type, event.title, event.eventDate, event.reminderMinutesBefore);

        await this.notificationsService.create({
          userId: user.id,
          type: NotificationType.CALENDAR_REMINDER,
          title: inAppTitle,
          body: inAppBody,
          metadata: { calendarEventId: event.id, reminderType: type },
        });
      }

      // 3. Notificação Email
      if (!settings || settings.notifyByEmail) {
        const { subject, html, text } = buildCalendarReminderEmail(
          user.name ?? '',
          event.title,
          event.eventDate,
          type as CalendarReminderType,
          event.reminderMinutesBefore,
          frontendUrl,
        );

        await this.emailService.sendMail({
          to: user.email,
          subject,
          html,
          text,
        });
      }

      // 4. Atualizar flags de notificação na DB
      const updateData: any = {};
      if (type === 'dayBefore') updateData.dayBeforeNotified = true;
      if (type === 'dayOf') updateData.dayOfNotified = true;
      if (type === 'final') updateData.finalReminderNotified = true;

      await this.prisma.calendarEvent.update({
        where: { id: eventId },
        data: updateData,
      });

      this.logger.log(`Notificação enviada com sucesso: eventId=${eventId}, tipo=${type}`);
    } catch (error) {
      this.logger.error(`Erro ao processar notificação de calendário: ${error.message}`);
      throw error;
    }
  }

  private getInAppTitle(type: ReminderJobType, title: string, mins: number): string {
    if (type === 'dayBefore') return `Amanhã: ${title}`;
    if (type === 'dayOf') return `Hoje: ${title}`;
    return `Em ${mins} min: ${title}`;
  }

  private getInAppBody(type: ReminderJobType, title: string, date: Date, mins: number): string {
    const time = date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    if (type === 'dayBefore') return `O teu evento "${title}" é amanhã às ${time}.`;
    if (type === 'dayOf') return `O teu evento "${title}" é hoje às ${time}.`;
    return `O teu evento "${title}" começa em ${mins} minutos (${time}).`;
  }
}
