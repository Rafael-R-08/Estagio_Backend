import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import * as webpush from 'web-push';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('webPush.vapidPublicKey');
    const privateKey = this.config.get<string>('webPush.vapidPrivateKey');
    const email = this.config.get<string>('webPush.vapidEmail');

    if (publicKey && privateKey) {
      webpush.setVapidDetails(email!, publicKey, privateKey);
      this.logger.log('Web Push VAPID keys configured');
    } else {
      this.logger.warn(
        'VAPID keys not set — web push disabled. Generate with: npx web-push generate-vapid-keys',
      );
    }
  }

  getVapidPublicKey(): string {
    return this.config.get<string>('webPush.vapidPublicKey') ?? '';
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const vapidPublicKey = this.config.get<string>('webPush.vapidPublicKey');
    if (!vapidPublicKey) return;

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        ),
      ),
    );

    // Remove expired/invalid subscriptions
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const err = result.reason as { statusCode?: number };
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await this.prisma.pushSubscription
            .delete({ where: { id: subscriptions[i].id } })
            .catch(() => null);
        } else {
          this.logger.warn(`Push send failed for subscription ${subscriptions[i].id}: ${err?.statusCode}`);
        }
      }
    }
  }
}
