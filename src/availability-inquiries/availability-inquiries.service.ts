import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import {
  AvailabilityInquiry,
  InquiryResponseCode,
  NotificationPriority,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { INQUIRY_RESPONSE_LABELS } from './availability-inquiries.constants';

const INQUIRY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class AvailabilityInquiriesService {
  private readonly logger = new Logger(AvailabilityInquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Un charter está "ocupado" cuando tiene:
   *   - TravelMatch.status='accepted'  (ya aceptó pero el viaje aún no se cerró), OR
   *   - Trip.status IN ('pending','charter_completed')  (viaje en curso).
   *
   * Deliberadamente NO incluimos match.status='pending': ese estado significa
   * que un cliente lo seleccionó pero el charter aún no respondió y podría
   * rechazar. Recién con 'accepted' está realmente en viaje activo.
   */
  async isCharterBusy(charterId: string): Promise<boolean> {
    const acceptedMatch = await this.prisma.travelMatch.findFirst({
      where: { charterId, status: 'accepted', deletedAt: null },
      select: { id: true },
    });
    if (acceptedMatch) return true;

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        charterId,
        status: { in: ['pending', 'charter_completed'] },
        deletedAt: null,
      },
      select: { id: true },
    });
    return !!activeTrip;
  }

  async createInquiry(fromUserId: string, charterId: string) {
    const charter = await this.prisma.user.findUnique({
      where: { id: charterId },
    });

    if (!charter || charter.role !== 'charter' || charter.deletedAt) {
      throw new NotFoundException('Chófer no encontrado');
    }

    if (charter.verificationStatus !== 'verified') {
      throw new BadRequestException('Este chófer no está disponible para consultas');
    }

    const busy = await this.isCharterBusy(charterId);
    if (!busy) {
      throw new BadRequestException(
        'Este charter está disponible, podés seleccionarlo directamente',
      );
    }

    const existing = await this.prisma.availabilityInquiry.findFirst({
      where: {
        fromUserId,
        toCharterId: charterId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Ya tenés una consulta pendiente con este charter',
      );
    }

    const fromUser = await this.prisma.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, name: true },
    });
    if (!fromUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const inquiry = await this.prisma.availabilityInquiry.create({
      data: {
        fromUserId,
        toCharterId: charterId,
        status: 'pending',
        expiresAt: new Date(Date.now() + INQUIRY_TTL_MS),
      },
    });

    try {
      await this.notificationsService.createOrUpdate({
        userId: charterId,
        type: 'availability_inquiry_received',
        title: 'Consulta de disponibilidad',
        body: `${fromUser.name} quiere saber si podés atenderlo más tarde`,
        priority: NotificationPriority.LOW,
        data: {
          inquiryId: inquiry.id,
          actionUrl: `/driver/dashboard?inquiry=${inquiry.id}`,
        },
        dedupeKey: `inquiry_received_${inquiry.id}`,
      });
    } catch (err) {
      this.logger.error(
        `Notificación availability_inquiry_received fallida (no crítico): ${err}`,
      );
    }

    return inquiry;
  }

  async respondInquiry(
    charterId: string,
    inquiryId: string,
    responseCode: InquiryResponseCode,
  ) {
    const inquiry = await this.prisma.availabilityInquiry.findUnique({
      where: { id: inquiryId },
      include: { toCharter: { select: { id: true, name: true } } },
    });

    if (!inquiry) {
      throw new NotFoundException('Consulta no encontrada');
    }

    if (inquiry.toCharterId !== charterId) {
      throw new ForbiddenException('No podés responder esta consulta');
    }

    if (inquiry.status !== 'pending') {
      throw new BadRequestException(
        `Esta consulta ya está en estado ${inquiry.status}`,
      );
    }

    if (inquiry.expiresAt < new Date()) {
      await this.prisma.availabilityInquiry.update({
        where: { id: inquiryId },
        data: { status: 'expired' },
      });
      throw new GoneException('Esta consulta expiró');
    }

    const updated = await this.prisma.availabilityInquiry.update({
      where: { id: inquiryId },
      data: {
        status: 'answered',
        responseCode,
        respondedAt: new Date(),
      },
    });

    const label = INQUIRY_RESPONSE_LABELS[responseCode];
    try {
      await this.notificationsService.createOrUpdate({
        userId: inquiry.fromUserId,
        type: 'availability_inquiry_answered',
        title: `Respuesta de ${inquiry.toCharter.name}`,
        body: label,
        priority: NotificationPriority.LOW,
        data: {
          inquiryId: inquiry.id,
          charterId: inquiry.toCharterId,
          responseCode,
          actionUrl: '/client/dashboard',
        },
        dedupeKey: `inquiry_answered_${inquiry.id}`,
      });
    } catch (err) {
      this.logger.error(
        `Notificación availability_inquiry_answered fallida (no crítico): ${err}`,
      );
    }

    return updated;
  }

  async getSent(fromUserId: string): Promise<AvailabilityInquiry[]> {
    const rows = await this.prisma.availabilityInquiry.findMany({
      where: { fromUserId },
      include: {
        toCharter: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.applyLazyExpiration(rows);
  }

  async getReceived(charterId: string): Promise<AvailabilityInquiry[]> {
    const rows = await this.prisma.availabilityInquiry.findMany({
      where: {
        toCharterId: charterId,
        status: 'pending',
        fromUser: { deletedAt: null },
      },
      include: {
        fromUser: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Solo devolvemos las que siguen vivas después de la validación lazy.
    const live = await this.applyLazyExpiration(rows);
    return live.filter((i) => i.status === 'pending');
  }

  /**
   * Recorre las filas; las que están pending con expiresAt vencido las
   * marca expired en DB y devuelve la versión actualizada.
   */
  private async applyLazyExpiration<T extends AvailabilityInquiry>(
    rows: T[],
  ): Promise<T[]> {
    const now = new Date();
    const toExpire = rows.filter(
      (r) => r.status === 'pending' && r.expiresAt < now,
    );
    if (toExpire.length === 0) return rows;

    await this.prisma.availabilityInquiry.updateMany({
      where: { id: { in: toExpire.map((r) => r.id) } },
      data: { status: 'expired' },
    });

    const expiredIds = new Set(toExpire.map((r) => r.id));
    return rows.map((r) =>
      expiredIds.has(r.id) ? ({ ...r, status: 'expired' } as T) : r,
    );
  }
}
