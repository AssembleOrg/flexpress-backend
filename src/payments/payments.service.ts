import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

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

    // TRANSACCIÓN: Actualizar payment + incrementar créditos del usuario
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'accepted' },
        include: { user: true },
      });

      await tx.user.update({
        where: { id: payment.userId },
        data: {
          credits: { increment: payment.credits },
        },
      });

      return updatedPayment;
    });

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

    const updatedPayment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'rejected',
        rejectionReason: reason,
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