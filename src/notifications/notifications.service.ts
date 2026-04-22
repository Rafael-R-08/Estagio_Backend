import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { Notification, Prisma } from '@prisma/client';
import { PushService } from '../push/push.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    // Fire-and-forget web push
    this.pushService
      .sendToUser(dto.userId, { title: dto.title, body: dto.body })
      .catch((err) => this.logger.warn(`Web push failed: ${err?.message}`));

    // Emit SSE event so connected clients update in real-time
    this.eventEmitter.emit(`notification.new.${dto.userId}`, notification);

    return notification;
  }

  async findForUser(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const where = {
      userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { items, total, unreadCount };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification)
      throw new NotFoundException('Notificação não encontrada');

    return await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { count: result.count };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount };
  }

  async deleteOld(userId: string, olderThanDays = 90): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await this.prisma.notification.deleteMany({
      where: { userId, createdAt: { lt: cutoff }, isRead: true },
    });
  }

  async deleteOne(id: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification)
      throw new NotFoundException('Notificação não encontrada');
    await this.prisma.notification.delete({ where: { id } });
  }

  async deleteAll(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });
    return { count: result.count };
  }
}
