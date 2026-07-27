import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createPaymentDto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.create({
      data: createPaymentDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return payment as PaymentResponseDto;
  }

  async findAll(paginationQuery: PaginationQueryDto): Promise<PaginatedResponseDto<PaymentResponseDto>> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.payment.count({
        where: { deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data: payments as PaymentResponseDto[],
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    return payment as PaymentResponseDto;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id },
      data: updatePaymentDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updatedPayment as PaymentResponseDto;
  }

  async remove(id: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    // Soft delete
    await this.prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(): Promise<PaymentResponseDto[]> {
    const payments = await this.prisma.payment.findMany({
      where: { deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return payments as PaymentResponseDto[];
  }

  async approvePayment(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException('El pago ya fue procesado');
    }

    // TRANSACCIÓN: reclamar el pago + acreditar.
    //
    // El chequeo de arriba es solo para dar un 400 claro: entre ese read y el
    // update no hay lock. La garantía real es `status: 'pending'` en el WHERE,
    // que Postgres reevalúa después de bloquear la fila. Sin esto, dos admins
    // (o un doble click) aprobando el mismo comprobante acreditaban el doble.
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'accepted' },
      });

      if (claimed.count !== 1) {
        throw new ConflictException('El pago ya fue procesado');
      }

      await tx.user.update({
        where: { id: payment.userId },
        data: {
          credits: { increment: payment.credits },
        },
      });

      return tx.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      });
    });

    try {
      await this.notificationsService.createOrUpdate({
        userId: payment.userId,
        type: 'payment_approved',
        title: '¡Recarga aprobada!',
        body: `Tu recarga de ${payment.credits} créditos fue aprobada.`,
        priority: NotificationPriority.HIGH,
        data: { actionUrl: '/client/dashboard' },
        dedupeKey: `payment_approved:payment:${paymentId}`,
      });
    } catch (err) {
      this.logger.error(`Notificación payment_approved fallida (no crítico): ${err}`);
    }

    return result as PaymentResponseDto;
  }

  async rejectPayment(paymentId: string, reason?: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Pago no encontrado');
    }

    if (payment.status !== 'pending') {
      throw new BadRequestException('El pago ya fue procesado');
    }

    // Mismo criterio que approvePayment: la condición viaja en el WHERE para
    // que un doble rechazo no dispare la notificación dos veces.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: {
        status: 'rejected',
        rejectionReason: reason,
      },
    });

    if (claimed.count !== 1) {
      throw new ConflictException('El pago ya fue procesado');
    }

    const updatedPayment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    try {
      await this.notificationsService.createOrUpdate({
        userId: payment.userId,
        type: 'payment_rejected',
        title: 'Recarga rechazada',
        body: `Tu recarga de ${payment.credits} créditos fue rechazada.`,
        priority: NotificationPriority.HIGH,
        data: { actionUrl: '/client/payments' },
      });
    } catch (err) {
      this.logger.error(`Notificación payment_rejected fallida (no crítico): ${err}`);
    }

    return updatedPayment as PaymentResponseDto;
  }

  async getPendingCount(): Promise<{ count: number }> {
    const count = await this.prisma.payment.count({
      where: { status: 'pending', deletedAt: null },
    });

    return { count };
  }

  async getPaymentsByUserId(userId: string): Promise<PaymentResponseDto[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return payments as PaymentResponseDto[];
  }
} 