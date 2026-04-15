import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarProcessor } from './processors/calendar.processor';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: 'calendar-reminders',
    }),
  ],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarProcessor],
  exports: [CalendarService],
})
export class CalendarModule {}
