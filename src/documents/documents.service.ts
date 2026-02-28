import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDocumentDto } from './dto/create-user-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // ─── User Documents ──────────────────────────────────────────────────────────

  async createUserDocument(userId: string, dto: CreateUserDocumentDto) {
    return this.prisma.userDocument.create({
      data: {
        userId,
        type: dto.type,
        side: dto.side,
        fileUrl: dto.fileUrl,
      },
    });
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
