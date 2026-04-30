import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  data?: { actionUrl?: string };
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('vapid.publicKey');
    const privateKey = this.config.get<string>('vapid.privateKey');
    const subject = this.config.get<string>('vapid.subject');

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys no configuradas — push notifications deshabilitadas');
      return;
    }

    webPush.setVapidDetails(subject!, publicKey, privateKey);
    this.logger.log('VAPID configurado correctamente');
  }

  async subscribe(userId: string, dto: SubscribePushDto): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { p256dh: dto.p256dh, auth: dto.auth, userId },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth },
    });
    this.logger.log(`Suscripción push guardada para usuario ${userId}`);
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const publicKey = this.config.get<string>('vapid.publicKey');
    if (!publicKey) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        ),
      ),
    );

    // Limpiar suscripciones vencidas (410 Gone o 404 Not Found)
    const staleEndpoints: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const err = result.reason as webPush.WebPushError;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleEndpoints.push(subscriptions[i].endpoint);
        } else {
          this.logger.warn(`Push fallido para usuario ${userId}: ${err?.message ?? err}`);
        }
      }
    });

    if (staleEndpoints.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      });
      this.logger.log(`Eliminadas ${staleEndpoints.length} suscripciones vencidas`);
    }
  }
}
