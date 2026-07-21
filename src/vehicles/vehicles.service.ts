import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { CreateVehicleDocumentDto } from './dto/create-vehicle-document.dto';

const MAX_VEHICLES_PER_CHARTER = 2;

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  // ─── Vehicles ────────────────────────────────────────────────────────────────

  async createVehicle(charterId: string, dto: CreateVehicleDto) {
    const count = await this.prisma.vehicle.count({
      where: { charterId, deletedAt: null },
    });

    if (count >= MAX_VEHICLES_PER_CHARTER) {
      throw new BadRequestException(
        `Máximo ${MAX_VEHICLES_PER_CHARTER} vehículos por charter`,
      );
    }

    return this.prisma.vehicle.create({
      data: { ...dto, charterId },
      include: { documents: true },
    });
  }

  async getMyVehicles(charterId: string) {
    return this.prisma.vehicle.findMany({
      where: { charterId, deletedAt: null },
      include: { documents: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateVehicle(vehicleId: string, charterId: string, dto: UpdateVehicleDto) {
    const vehicle = await this.findVehicleOrFail(vehicleId);
    this.assertOwnership(vehicle.charterId, charterId);
    // Editar devuelve el vehículo a 'pending' (re-verificación): no se permite
    // sobre el vehículo con el que el charter está disponible ahora mismo.
    await this.assertVehicleNotActiveWhileAvailable(vehicleId, charterId);

    // Si el vehículo estaba rechazado, corregirlo lo devuelve a la cola de
    // re-verificación del admin (pending) y limpia el motivo anterior.
    const data =
      vehicle.verificationStatus === 'rejected'
        ? { ...dto, verificationStatus: 'pending' as const, rejectionReason: null }
        : dto;

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
      include: { documents: { where: { deletedAt: null } } },
    });
  }

  async toggleEnabled(vehicleId: string, charterId: string) {
    const vehicle = await this.findVehicleOrFail(vehicleId);
    this.assertOwnership(vehicle.charterId, charterId);

    if (vehicle.verificationStatus !== 'verified') {
      throw new BadRequestException(
        'Solo puedes habilitar un vehículo verificado por el administrador',
      );
    }

    // Solo bloqueamos al DESHABILITAR el vehículo activo mientras está
    // disponible. Habilitar otro vehículo no afecta la disponibilidad actual.
    if (vehicle.isEnabled) {
      await this.assertVehicleNotActiveWhileAvailable(vehicleId, charterId);
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { isEnabled: !vehicle.isEnabled },
    });
  }

  async deleteVehicle(vehicleId: string, charterId: string) {
    const vehicle = await this.findVehicleOrFail(vehicleId);
    this.assertOwnership(vehicle.charterId, charterId);
    await this.assertVehicleNotActiveWhileAvailable(vehicleId, charterId);

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Vehicle Documents ───────────────────────────────────────────────────────

  async createVehicleDocument(vehicleId: string, charterId: string, dto: CreateVehicleDocumentDto) {
    const vehicle = await this.findVehicleOrFail(vehicleId);
    this.assertOwnership(vehicle.charterId, charterId);

    // Re-subir un documento de un vehículo rechazado lo devuelve a pending
    // para que el admin lo re-revise. Atómico: crear doc + resetear estado.
    const wasRejected = vehicle.verificationStatus === 'rejected';

    const [document] = await this.prisma.$transaction([
      this.prisma.vehicleDocument.create({
        data: {
          vehicleId,
          type: dto.type,
          fileUrl: dto.fileUrl,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      }),
      ...(wasRejected
        ? [
            this.prisma.vehicle.update({
              where: { id: vehicleId },
              data: { verificationStatus: 'pending' as const, rejectionReason: null },
            }),
          ]
        : []),
    ]);

    return document;
  }

  async getVehicleDocuments(vehicleId: string, charterId: string) {
    const vehicle = await this.findVehicleOrFail(vehicleId);
    this.assertOwnership(vehicle.charterId, charterId);

    return this.prisma.vehicleDocument.findMany({
      where: { vehicleId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async reviewVehicle(vehicleId: string, status: 'verified' | 'rejected', adminId: string, rejectionReason?: string) {
    const vehicle = await this.findVehicleOrFail(vehicleId);

    if (status === 'rejected' && !rejectionReason) {
      throw new BadRequestException('Debe proporcionar razón de rechazo');
    }

    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        verificationStatus: status,
        rejectionReason: status === 'rejected' ? rejectionReason : null,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        isEnabled: status === 'verified' ? false : vehicle.isEnabled, // No auto-habilita, el charter decide
      },
      include: { documents: true },
    });
  }

  async getAllPendingVehicles() {
    return this.prisma.vehicle.findMany({
      where: { verificationStatus: 'pending', deletedAt: null },
      include: {
        documents: { where: { deletedAt: null } },
        charter: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async findVehicleOrFail(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    return vehicle;
  }

  private assertOwnership(vehicleCharterId: string, requestingCharterId: string) {
    if (vehicleCharterId !== requestingCharterId) {
      throw new ForbiddenException('No tenés permiso sobre este vehículo');
    }
  }

  /**
   * Impide modificar el vehículo con el que el charter está disponible en este
   * momento. Si se permitiera, charterAvailability.vehicleId quedaría apuntando
   * a un vehículo deshabilitado/pendiente/borrado y el charter se volvería
   * invisible o inconsistente en las búsquedas.
   */
  private async assertVehicleNotActiveWhileAvailable(
    vehicleId: string,
    charterId: string,
  ) {
    const availability = await this.prisma.charterAvailability.findUnique({
      where: { charterId },
      select: { isAvailable: true, vehicleId: true },
    });
    if (availability?.isAvailable && availability.vehicleId === vehicleId) {
      throw new BadRequestException(
        'Desconectate antes de modificar el vehículo con el que estás disponible.',
      );
    }
  }
}
