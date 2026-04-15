import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CalendarReminderJobData, ReminderJobType } from './processors/calendar.processor';

const DEFAULT_REMINDER_MINUTES = 30;

function computeReminderFireAt(
  eventDate: Date,
  reminderMinutesBefore: number,
): Date {
  return new Date(eventDate.getTime() - reminderMinutesBefore * 60 * 1000);
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('calendar-reminders') private readonly calendarQueue: Queue<CalendarReminderJobData>,
  ) {}

  private async scheduleReminders(eventId: string, eventDate: Date, reminderMinutesBefore: number) {
    const now = Date.now();
    
    // Tipos de lembretes e seus timings
    const reminderConfigs: { type: ReminderJobType; time: Date }[] = [
      { type: 'dayBefore', time: new Date(new Date(eventDate).setDate(eventDate.getDate() - 1)) },
      { type: 'dayOf', time: new Date(new Date(eventDate).setHours(9, 0, 0, 0)) }, // 9 AM do próprio dia
      { type: 'final', time: computeReminderFireAt(eventDate, reminderMinutesBefore) }
    ];

    for (const config of reminderConfigs) {
      const delay = config.time.getTime() - now;
      
      // Só agendar se for no futuro
      if (delay > 0) {
        await this.calendarQueue.add(
          'reminder',
          { eventId, type: config.type },
          { 
            delay, 
            jobId: `reminder:${eventId}:${config.type}`,
            removeOnComplete: true,
            removeOnFail: false
          }
        );
      }
    }
  }

  private async cancelReminders(eventId: string) {
    const types: ReminderJobType[] = ['dayBefore', 'dayOf', 'final'];
    for (const type of types) {
      const jobId = `reminder:${eventId}:${type}`;
      const job = await this.calendarQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    }
  }

  async create(userId: string, dto: CreateCalendarEventDto) {
    const eventDate = new Date(dto.eventDate);
    if (eventDate <= new Date()) {
      throw new BadRequestException('A data do evento tem de ser no futuro');
    }

    const reminderMinutesBefore =
      dto.reminderMinutesBefore ?? DEFAULT_REMINDER_MINUTES;
    const reminderFireAt = computeReminderFireAt(
      eventDate,
      reminderMinutesBefore,
    );

    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        eventDate,
        reminderMinutesBefore,
        reminderFireAt,
      },
    });

    await this.scheduleReminders(event.id, eventDate, reminderMinutesBefore);

    return event;
  }

  async findAll(userId: string) {
    return await this.prisma.calendarEvent.findMany({
      where: { userId },
      orderBy: { eventDate: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Evento não encontrado');
    if (event.userId !== userId) throw new ForbiddenException();
    return event;
  }

  async update(id: string, userId: string, dto: UpdateCalendarEventDto) {
    const event = await this.findOne(id, userId);

    const eventDate = dto.eventDate ? new Date(dto.eventDate) : event.eventDate;
    if (dto.eventDate && eventDate <= new Date()) {
      throw new BadRequestException('A data do evento tem de ser no futuro');
    }

    const reminderMinutesBefore =
      dto.reminderMinutesBefore ?? event.reminderMinutesBefore;
    const reminderFireAt = computeReminderFireAt(
      eventDate,
      reminderMinutesBefore,
    );

    // If the event date or reminder window changed, reset all notification flags
    const datesChanged =
      dto.eventDate !== undefined || dto.reminderMinutesBefore !== undefined;

    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        eventDate,
        reminderMinutesBefore,
        reminderFireAt,
        ...(datesChanged && {
          dayBeforeNotified: false,
          dayOfNotified: false,
          finalReminderNotified: false,
        }),
      },
    });

    if (datesChanged) {
      await this.cancelReminders(id);
      await this.scheduleReminders(id, eventDate, reminderMinutesBefore);
    }

    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.cancelReminders(id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { message: 'Evento eliminado com sucesso' };
  }

  async exportIcs(userId: string): Promise<string> {
    const events = await this.prisma.calendarEvent.findMany({
      where: { userId },
      orderBy: { eventDate: 'asc' },
    });

    const formatIcsDate = (date: Date): string =>
      date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

    const escapeIcs = (value: string): string =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LearningHub//LearningHub//PT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const event of events) {
      const dtStart = formatIcsDate(event.eventDate);
      const dtStamp = formatIcsDate(event.createdAt);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.id}@learninghub`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtStart}`);
      lines.push(`SUMMARY:${escapeIcs(event.title)}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
      }
      if (event.reminderMinutesBefore > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:${escapeIcs(event.title)}`);
        lines.push(`TRIGGER:-PT${event.reminderMinutesBefore}M`);
        lines.push('END:VALARM');
      }
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
