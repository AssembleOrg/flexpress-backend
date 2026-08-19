import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationPriority, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUserDocumentDto } from './dto/create-user-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── User Documents ──────────────────────────────────────────────────────────

  async createUserDocument(userId: string, dto: CreateUserDocumentDto) {
    const doc = await this.prisma.userDocument.create({
      data: {
        userId,
        type: dto.type,
        side: dto.side,
        fileUrl: dto.fileUrl,
      },
    });

    // Un cliente (role user) que sube su DNI entra a la cola de verificación.
    // Los charters ya nacen 'pending' en el register; los users nacen 'verified'
    // (default del schema) para no afectar a los existentes, así que sólo
    // transicionamos verified→pending en el acto de subir el DNI. Idempotente: la
    // 2da imagen (front/back) ya lo ve 'pending' y no reenvía notificación.
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, verificationStatus: true, name: true },
      });
      if (user?.role === 'user' && user.verificationStatus === 'verified') {
        await this.prisma.user.update({
          where: { id: userId },
          data: { verificationStatus: 'pending' },
        });
        await this.notifyAdminsUserPending(userId, user.name);
      }
    } catch (err) {
      this.logger.error(
        `Transición a verificación pendiente fallida (no crítico): ${err}`,
      );
    }

    return doc;
  }

  private async notifyAdminsUserPending(userId: string, userName: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.admin, deletedAt: null },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.createOrUpdate({
          userId: admin.id,
          type: 'user_verification_pending',
          title: 'Nuevo cliente por verificar',
          body: `${userName} subió su DNI y espera verificación.`,
          priority: NotificationPriority.HIGH,
          data: { actionUrl: '/admin' },
          dedupeKey: `user_verification:user:${userId}`,
        }),
      ),
    );
  }

  async getUserDocuments(userId: string) {
    return this.prisma.userDocument.findMany({
      where: { userId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async deleteUserDocument(docId: string, requestingUserId: string, isAdmin: boolean) {
    const doc = await this.prisma.userDocument.findFirst({
      where: { id: docId, deletedAt: null },
    });

    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (!isAdmin && doc.userId !== requestingUserId) {
      throw new ForbiddenException('Sin permiso');
    }

    return this.prisma.userDocument.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Admin: review user document ─────────────────────────────────────────────

  async reviewUserDocument(docId: string, dto: ReviewDocumentDto, adminId: string) {
    const doc = await this.prisma.userDocument.findFirst({
      where: { id: docId, deletedAt: null },
    });

    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    return this.prisma.userDocument.update({
      where: { id: docId },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });
  }

  // ─── Admin: review vehicle document ──────────────────────────────────────────

  async reviewVehicleDocument(docId: string, dto: ReviewDocumentDto, adminId: string) {
    const doc = await this.prisma.vehicleDocument.findFirst({
      where: { id: docId, deletedAt: null },
    });

    if (!doc) throw new NotFoundException('Documento de vehículo no encontrado');
    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    return this.prisma.vehicleDocument.update({
      where: { id: docId },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });
  }
}
