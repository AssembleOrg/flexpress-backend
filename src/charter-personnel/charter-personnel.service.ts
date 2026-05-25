import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CreateDriverDocumentDto } from './dto/create-driver-document.dto';
import { CreateHelperDto } from './dto/create-helper.dto';
import { UpdateHelperDto } from './dto/update-helper.dto';
import { CreateHelperDocumentDto } from './dto/create-helper-document.dto';
import { ReviewEntityDto, ReviewDocumentDto } from './dto/review.dto';

const MAX_DRIVERS_PER_CHARTER = 2;
const MAX_HELPERS_PER_CHARTER = 2;

const REQUIRED_DRIVER_DOCS: Array<{ type: 'dni'; side: 'front' | 'back' } | { type: 'license' }> = [
  { type: 'dni', side: 'front' },
  { type: 'dni', side: 'back' },
  { type: 'license' },
];

const REQUIRED_HELPER_DOCS: Array<{ type: 'dni'; side: 'front' | 'back' }> = [
  { type: 'dni', side: 'front' },
  { type: 'dni', side: 'back' },
];

@Injectable()
export class CharterPersonnelService {
  constructor(private prisma: PrismaService) {}

  // ─── DRIVERS ────────────────────────────────────────────────────────────────

  async createDriver(charterId: string, dto: CreateDriverDto) {
    await this.assertCharterVerified(charterId);

    const count = await this.prisma.charterDriver.count({
      where: { charterId, deletedAt: null },
    });
    if (count >= MAX_DRIVERS_PER_CHARTER) {
      throw new BadRequestException(
        `Máximo ${MAX_DRIVERS_PER_CHARTER} conductores activos por charter`,
      );
    }

    return this.prisma.charterDriver.create({
      data: { ...dto, charterId },
      include: { documents: true },
    });
  }

  async getMyDrivers(charterId: string) {
    return this.prisma.charterDriver.findMany({
      where: { charterId, deletedAt: null },
      include: { documents: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDriver(driverId: string, charterId: string) {
    const driver = await this.findDriverOrFail(driverId);
    this.assertOwnership(driver.charterId, charterId);
    return this.prisma.charterDriver.findUnique({
      where: { id: driverId },
      include: { documents: { where: { deletedAt: null } } },
    });
  }

  async updateDriver(driverId: string, charterId: string, dto: UpdateDriverDto) {
    const driver = await this.findDriverOrFail(driverId);
    this.assertOwnership(driver.charterId, charterId);

    if (driver.verificationStatus !== 'rejected') {
      throw new BadRequestException(
        'Solo podés editar un conductor rechazado. Para cambios contactá al admin.',
      );
    }

    return this.prisma.charterDriver.update({
      where: { id: driverId },
      data: {
        ...dto,
        verificationStatus: 'pending',
        rejectionReason: null,
      },
      include: { documents: { where: { deletedAt: null } } },
    });
  }

  async toggleDriverEnabled(driverId: string, charterId: string) {
    const driver = await this.findDriverOrFail(driverId);
    this.assertOwnership(driver.charterId, charterId);

    if (driver.verificationStatus !== 'verified') {
      throw new BadRequestException(
        'Solo podés habilitar un conductor verificado por el administrador',
      );
    }

    return this.prisma.charterDriver.update({
      where: { id: driverId },
      data: { isEnabled: !driver.isEnabled },
    });
  }

  async deleteDriver(driverId: string, charterId: string) {
    const driver = await this.findDriverOrFail(driverId);
    this.assertOwnership(driver.charterId, charterId);

    const activeAssignment = await this.prisma.tripPersonnel.findFirst({
      where: {
        driverId,
        match: { status: { in: ['accepted', 'pending'] } },
      },
    });
    if (activeAssignment) {
      throw new BadRequestException(
        'No podés borrar un conductor asignado a un viaje activo. Finalizá el viaje primero.',
      );
    }

    return this.prisma.charterDriver.update({
      where: { id: driverId },
      data: { deletedAt: new Date() },
    });
  }

  async addDriverDocument(driverId: string, charterId: string, dto: CreateDriverDocumentDto) {
    const driver = await this.findDriverOrFail(driverId);
    this.assertOwnership(driver.charterId, charterId);

    if (dto.type === 'dni' && !dto.side) {
      throw new BadRequestException('El DNI requiere indicar lado (front/back)');
    }

    const doc = await this.prisma.charterDriverDocument.create({
      data: {
        driverId,
        type: dto.type,
        side: dto.side,
        fileUrl: dto.fileUrl,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    // Si la entidad estaba verified/rejected, vuelve a pending al recibir docs nuevos
    if (driver.verificationStatus !== 'pending') {
      await this.prisma.charterDriver.update({
        where: { id: driverId },
        data: { verificationStatus: 'pending', rejectionReason: null, isEnabled: false },
      });
    }

    return doc;
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  async createHelper(charterId: string, dto: CreateHelperDto) {
    await this.assertCharterVerified(charterId);

    const count = await this.prisma.charterHelper.count({
      where: { charterId, deletedAt: null },
    });
    if (count >= MAX_HELPERS_PER_CHARTER) {
      throw new BadRequestException(
        `Máximo ${MAX_HELPERS_PER_CHARTER} ayudantes activos por charter`,
      );
    }

    return this.prisma.charterHelper.create({
      data: { ...dto, charterId },
      include: { documents: true },
    });
  }

  async getMyHelpers(charterId: string) {
    return this.prisma.charterHelper.findMany({
      where: { charterId, deletedAt: null },
      include: { documents: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getHelper(helperId: string, charterId: string) {
    const helper = await this.findHelperOrFail(helperId);
    this.assertOwnership(helper.charterId, charterId);
    return this.prisma.charterHelper.findUnique({
      where: { id: helperId },
      include: { documents: { where: { deletedAt: null } } },
    });
  }

  async updateHelper(helperId: string, charterId: string, dto: UpdateHelperDto) {
    const helper = await this.findHelperOrFail(helperId);
    this.assertOwnership(helper.charterId, charterId);

    if (helper.verificationStatus !== 'rejected') {
      throw new BadRequestException(
        'Solo podés editar un ayudante rechazado. Para cambios contactá al admin.',
      );
    }

    return this.prisma.charterHelper.update({
      where: { id: helperId },
      data: {
        ...dto,
        verificationStatus: 'pending',
        rejectionReason: null,
      },
      include: { documents: { where: { deletedAt: null } } },
    });
  }

  async toggleHelperEnabled(helperId: string, charterId: string) {
    const helper = await this.findHelperOrFail(helperId);
    this.assertOwnership(helper.charterId, charterId);

    if (helper.verificationStatus !== 'verified') {
      throw new BadRequestException(
        'Solo podés habilitar un ayudante verificado por el administrador',
      );
    }

    return this.prisma.charterHelper.update({
      where: { id: helperId },
      data: { isEnabled: !helper.isEnabled },
    });
  }

  async deleteHelper(helperId: string, charterId: string) {
    const helper = await this.findHelperOrFail(helperId);
    this.assertOwnership(helper.charterId, charterId);

    const activeAssignment = await this.prisma.tripPersonnel.findFirst({
      where: {
        helperIds: { has: helperId },
        match: { status: { in: ['accepted', 'pending'] } },
      },
    });
    if (activeAssignment) {
      throw new BadRequestException(
        'No podés borrar un ayudante asignado a un viaje activo. Finalizá el viaje primero.',
      );
    }

    return this.prisma.charterHelper.update({
      where: { id: helperId },
      data: { deletedAt: new Date() },
    });
  }

  async addHelperDocument(helperId: string, charterId: string, dto: CreateHelperDocumentDto) {
    const helper = await this.findHelperOrFail(helperId);
    this.assertOwnership(helper.charterId, charterId);

    const doc = await this.prisma.charterHelperDocument.create({
      data: {
        helperId,
        type: dto.type,
        side: dto.side,
        fileUrl: dto.fileUrl,
      },
    });

    if (helper.verificationStatus !== 'pending') {
      await this.prisma.charterHelper.update({
        where: { id: helperId },
        data: { verificationStatus: 'pending', rejectionReason: null, isEnabled: false },
      });
    }

    return doc;
  }

  // ─── ADMIN ──────────────────────────────────────────────────────────────────

  async adminListPendingDrivers() {
    return this.prisma.charterDriver.findMany({
      where: { verificationStatus: 'pending', deletedAt: null },
      include: {
        documents: { where: { deletedAt: null } },
        charter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adminListPendingHelpers() {
    return this.prisma.charterHelper.findMany({
      where: { verificationStatus: 'pending', deletedAt: null },
      include: {
        documents: { where: { deletedAt: null } },
        charter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async adminReviewDriver(driverId: string, adminId: string, dto: ReviewEntityDto) {
    const driver = await this.findDriverOrFail(driverId);

    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    if (dto.status === 'verified') {
      const docs = await this.prisma.charterDriverDocument.findMany({
        where: { driverId, deletedAt: null },
      });
      const allApproved = REQUIRED_DRIVER_DOCS.every((req) => {
        return docs.some(
          (d) =>
            d.type === (req.type as any) &&
            ('side' in req ? d.side === req.side : d.side === null) &&
            d.status === 'approved',
        );
      });
      if (!allApproved) {
        throw new BadRequestException(
          'Para aprobar al conductor, todos sus documentos (DNI front, DNI back, licencia) deben estar aprobados',
        );
      }
    }

    return this.prisma.charterDriver.update({
      where: { id: driverId },
      data: {
        verificationStatus: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        isEnabled: dto.status === 'verified' ? false : driver.isEnabled,
      },
      include: { documents: true },
    });
  }

  async adminReviewHelper(helperId: string, adminId: string, dto: ReviewEntityDto) {
    const helper = await this.findHelperOrFail(helperId);

    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    if (dto.status === 'verified') {
      const docs = await this.prisma.charterHelperDocument.findMany({
        where: { helperId, deletedAt: null },
      });
      const allApproved = REQUIRED_HELPER_DOCS.every((req) =>
        docs.some(
          (d) => d.type === (req.type as any) && d.side === req.side && d.status === 'approved',
        ),
      );
      if (!allApproved) {
        throw new BadRequestException(
          'Para aprobar al ayudante, ambos lados del DNI deben estar aprobados',
        );
      }
    }

    return this.prisma.charterHelper.update({
      where: { id: helperId },
      data: {
        verificationStatus: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        isEnabled: dto.status === 'verified' ? false : helper.isEnabled,
      },
      include: { documents: true },
    });
  }

  async adminReviewDriverDocument(docId: string, adminId: string, dto: ReviewDocumentDto) {
    const doc = await this.prisma.charterDriverDocument.findFirst({
      where: { id: docId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    return this.prisma.charterDriverDocument.update({
      where: { id: docId },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });
  }

  async adminReviewHelperDocument(docId: string, adminId: string, dto: ReviewDocumentDto) {
    const doc = await this.prisma.charterHelperDocument.findFirst({
      where: { id: docId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');

    if (dto.status === 'rejected' && !dto.rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    return this.prisma.charterHelperDocument.update({
      where: { id: docId },
      data: {
        status: dto.status,
        rejectionReason: dto.status === 'rejected' ? dto.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });
  }

  // ─── HELPERS / VALIDATORS ───────────────────────────────────────────────────

  private async findDriverOrFail(driverId: string) {
    const driver = await this.prisma.charterDriver.findFirst({
      where: { id: driverId, deletedAt: null },
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado');
    return driver;
  }

  private async findHelperOrFail(helperId: string) {
    const helper = await this.prisma.charterHelper.findFirst({
      where: { id: helperId, deletedAt: null },
    });
    if (!helper) throw new NotFoundException('Ayudante no encontrado');
    return helper;
  }

  private assertOwnership(entityCharterId: string, requestingCharterId: string) {
    if (entityCharterId !== requestingCharterId) {
      throw new ForbiddenException('No tenés permiso sobre este recurso');
    }
  }

  private async assertCharterVerified(charterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: charterId },
      select: { verificationStatus: true, role: true },
    });
    if (!user || user.role !== 'charter') {
      throw new ForbiddenException('Solo charters pueden gestionar personal');
    }
    if (user.verificationStatus !== 'verified') {
      throw new ForbiddenException(
        'Tu cuenta de charter debe estar verificada para gestionar personal',
      );
    }
  }
}
