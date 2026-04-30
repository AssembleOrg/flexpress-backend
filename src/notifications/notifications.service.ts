import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';
import { PushService } from '../push/push.service';
import { CreateNotificationDto, QueryNotificationsDto } from './dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TravelMatchingGateway))
    private readonly gateway: TravelMatchingGateway,
    private readonly pushService: PushService,
  ) {}

  async createOrUpdate(dto: CreateNotificationDto): Promise<Notification> {
    let notification: Notification;

    if (dto.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: dto.userId,
          dedupeKey: dto.dedupeKey,
          isRead: false,
        },
      });

      if (existing) {
        notification = await this.prisma.notification.update({
          where: { id: existing.id },
          data: {
            body: dto.body,
            data: (dto.data ?? existing.data) as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        });
      } else {
        notification = await this.prisma.notification.create({
          data: {
            userId: dto.userId,
            type: dto.type,
            title: dto.title,
            body: dto.body,
            priority: dto.priority,
            data: dto.data as Prisma.InputJsonValue | undefined,
            dedupeKey: dto.dedupeKey,
          },
        });
      }
    } else {
      notification = await this.prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          priority: dto.priority,
          data: dto.data as Prisma.InputJsonValue | undefined,
          dedupeKey: dto.dedupeKey,
        },
      });
    }

    // Fast path in-app: actualiza badge via WebSocket si el usuario está conectado
    try {
      this.gateway.notifyUser(dto.userId, 'notification:new', {
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
      });
    } catch (err) {
      this.logger.warn(`Socket emit notification:new fallido (no crítico): ${err}`);
    }

    // Push al dispositivo — llega aunque la app esté cerrada (fire-and-forget)
    this.pushService
      .sendToUser(dto.userId, {
        title: notification.title,
        body: notification.body,
        icon: '/genfavicon-512.png',
        data: { actionUrl: (notification.data as any)?.actionUrl ?? '/' },
      })
      .catch((err) =>
        this.logger.warn(`Web push fallido (no crítico): ${err?.message ?? err}`),
      );

    return notification;
  }

  async findManyByUser(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
    const limit = query.limit ?? 20;
    const where = {
      userId,
      ...(query.onlyUnread ? { isRead: false } : {}),
    };

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });

    let nextCursor: string | null = null;
    if (notifications.length > limit) {
      const lastItem = notifications.pop();
      nextCursor = lastItem!.id;
    }

    return { notifications, nextCursor };
  }

  async countUnread(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  @Cron('0 3 * * *')
  async cleanupOldNotifications(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const result = await this.prisma.notification.deleteMany({
      where: { isRead: true, createdAt: { lt: cutoff } },
    });

    this.logger.log(`Cleanup: eliminadas ${result.count} notificaciones leídas con más de 30 días`);
  }
}
