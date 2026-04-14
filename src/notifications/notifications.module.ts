import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import { CertificateNotificationListener } from './listeners/certificate-notification.listener';
import { CertificateExpiryScheduler } from './schedulers/certificate-expiry.scheduler';
import { CertificateStuckScheduler } from './schedulers/certificate-stuck.scheduler';
import { TrainingNotificationListener } from './listeners/training-notification.listener';
import { TrainingStagnationScheduler } from './schedulers/training-stagnation.scheduler';
import { WeeklyRecommendationsScheduler } from './schedulers/weekly-recommendations.scheduler';
import { SlManagerDigestScheduler } from './schedulers/sl-manager-digest.scheduler';
import { OnboardingReminderScheduler } from './schedulers/onboarding-reminder.scheduler';
import { CalendarReminderScheduler } from './schedulers/calendar-reminder.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, AiModule, PushModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailService,
    CertificateNotificationListener,
    CertificateExpiryScheduler,
    CertificateStuckScheduler,
    TrainingNotificationListener,
    TrainingStagnationScheduler,
    WeeklyRecommendationsScheduler,
    SlManagerDigestScheduler,
    OnboardingReminderScheduler,
    CalendarReminderScheduler,
  ],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
