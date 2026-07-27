import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToggleAvailabilityDto, UpdateCharterOriginDto } from './dto';
import { nowInBuenosAires } from '../common/utils/date.util';

/**
 * Configuración propia del charter: si está disponible, con qué vehículo y qué
 * personal, y desde qué origen sale.
 *
 * Separado de TravelMatchingService porque no es lógica de matching: no lee ni
 * escribe TravelMatch. Es el estado que el charter administra sobre su cuenta y
 * que el matching después consulta.
 */
@Injectable()
export class CharterAvailabilityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Toggle charter availability
   */
  async toggleAvailability(charterId: string, dto: ToggleAvailabilityDto) {
    // Verify charter has origin location set
    const charter = await this.prisma.user.findUnique({
      where: { id: charterId },
    });

    if (!charter || charter.role !== 'charter') {
      throw new NotFoundException('Chófer no encontrado');
    }

    // Check if charter is verified by admin
    if (charter.verificationStatus !== 'verified') {
      throw new BadRequestException(
        'Tu cuenta está pendiente de validación. Serás notificado cuando un administrador apruebe tu cuenta.',
      );
    }

    // Cuenta bloqueada por el admin: no puede ponerse disponible.
    if (dto.isAvailable && charter.accountStatus === 'banned') {
      throw new BadRequestException(
        charter.accountStatusNote
          ? `Tu cuenta está bloqueada: ${charter.accountStatusNote}`
          : 'Tu cuenta está bloqueada. Contactá con soporte.',
      );
    }

    if (!charter.originLatitude || !charter.originLongitude) {
      throw new BadRequestException(
        'El chófer debe configurar su ubicación de origen antes de estar disponible',
      );
    }

    if (dto.isAvailable && charter.credits < 2) {
      throw new BadRequestException(
        'Necesitás al menos 2 créditos para activar tu disponibilidad',
      );
    }

    // Config activa "efectiva": si al (re)activarse el front no manda
    // conductor/vehículo explícitos (ej: botones "Volver a mi zona"), heredamos
    // la última config guardada y la revalidamos abajo. Así no se pierde el
    // conductor elegido entre viajes.
    const existing = await this.prisma.charterAvailability.findUnique({
      where: { charterId },
      select: { vehicleId: true, activeDriverId: true, activeHelperIds: true },
    });

    const sentExplicitConfig =
      dto.activeDriverId !== undefined ||
      dto.activeHelperIds !== undefined ||
      dto.vehicleId !== undefined;

    let effectiveVehicleId = dto.isAvailable
      ? sentExplicitConfig
        ? (dto.vehicleId ?? null)
        : (existing?.vehicleId ?? null)
      : null;
    const effectiveDriverId = dto.isAvailable
      ? sentExplicitConfig
        ? (dto.activeDriverId ?? null)
        : (existing?.activeDriverId ?? null)
      : null;
    const effectiveHelperIds = dto.isAvailable
      ? sentExplicitConfig
        ? (dto.activeHelperIds ?? [])
        : (existing?.activeHelperIds ?? [])
      : [];

    if (dto.isAvailable && effectiveVehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: effectiveVehicleId },
      });

      if (!vehicle || vehicle.charterId !== charterId) {
        throw new NotFoundException('Vehículo no encontrado');
      }

      if (vehicle.verificationStatus !== 'verified') {
        throw new BadRequestException(
          'El vehículo seleccionado no está verificado. Solo podés activarte con un vehículo aprobado.',
        );
      }
    }

    // Sin vehículo efectivo al activarse: no se permite quedar disponible con
    // vehicleId null (eso volvía al charter invisible en findAvailableCharters).
    // Si hay exactamente un vehículo verificado, lo autoseleccionamos; si hay
    // varios, exigimos que el charter elija uno.
    if (dto.isAvailable && !effectiveVehicleId) {
      const verifiedVehicles = await this.prisma.vehicle.findMany({
        where: {
          charterId,
          verificationStatus: 'verified',
        },
        select: { id: true },
      });

      if (verifiedVehicles.length === 0) {
        throw new BadRequestException(
          'Necesitás al menos un vehículo verificado para activarte.',
        );
      }

      if (verifiedVehicles.length === 1) {
        effectiveVehicleId = verifiedVehicles[0].id;
      } else {
        throw new BadRequestException(
          'Seleccioná el vehículo con el que vas a estar disponible.',
        );
      }
    }

    // Validar config activa (conductor + ayudantes) al activarse.
    // El conductor extra y su vehículo van de la mano: si hay un conductor
    // extra activo, el vehículo es obligatorio. El titular (sin driver) sigue
    // como hasta ahora. Esto revalida también la config HEREDADA en una
    // reactivación, de modo que un conductor deshabilitado entremedio se
    // detecte con un mensaje claro.
    if (dto.isAvailable && effectiveDriverId) {
      if (!effectiveVehicleId) {
        throw new BadRequestException(
          'Para activarte con un conductor extra debés seleccionar también su vehículo.',
        );
      }

      const driver = await this.prisma.charterDriver.findFirst({
        where: { id: effectiveDriverId, charterId, deletedAt: null },
      });
      if (!driver) {
        throw new BadRequestException(
          'El conductor activo ya no existe o no pertenece a tu cuenta. Volvé a elegir un conductor.',
        );
      }
      if (driver.verificationStatus !== 'verified' || !driver.isEnabled) {
        throw new BadRequestException(
          `El conductor ${driver.firstName} ${driver.lastName} ya no está disponible (deshabilitado o sin verificar). Elegí otro conductor.`,
        );
      }
    }

    if (dto.isAvailable && effectiveHelperIds.length > 0) {
      const helpers = await this.prisma.charterHelper.findMany({
        where: { id: { in: effectiveHelperIds }, charterId, deletedAt: null },
      });
      if (helpers.length !== effectiveHelperIds.length) {
        throw new BadRequestException(
          'Uno o más ayudantes activos ya no existen o no pertenecen a tu cuenta. Revisá tu selección.',
        );
      }
      for (const h of helpers) {
        if (h.verificationStatus !== 'verified' || !h.isEnabled) {
          throw new BadRequestException(
            `El ayudante ${h.firstName} ${h.lastName} ya no está disponible (deshabilitado o sin verificar).`,
          );
        }
      }
    }

    // Upsert availability.
    // Al activarse, persistimos la config efectiva (conductor + vehículo +
    // ayudantes), ya sea la enviada explícitamente o la heredada/revalidada.
    // Al desactivarse, CONSERVAMOS la última config para reusarla en la próxima
    // reactivación (ej: "Volver a mi zona"); solo cambia isAvailable.
    const activeConfig = dto.isAvailable
      ? {
          vehicleId: effectiveVehicleId,
          activeDriverId: effectiveDriverId,
          activeHelperIds: effectiveHelperIds,
        }
      : {};

    const availability = await this.prisma.charterAvailability.upsert({
      where: { charterId },
      create: {
        charterId,
        isAvailable: dto.isAvailable,
        lastToggledAt: nowInBuenosAires().toJSDate(),
        ...activeConfig,
      },
      update: {
        isAvailable: dto.isAvailable,
        lastToggledAt: nowInBuenosAires().toJSDate(),
        ...activeConfig,
      },
    });

    return {
      success: true,
      message: `Disponibilidad actualizada: ${dto.isAvailable ? 'Disponible' : 'No disponible'}`,
      data: availability,
    };
  }

  /**
   * Get charter availability
   */
  async getAvailability(charterId: string) {
    const availability = await this.prisma.charterAvailability.findUnique({
      where: { charterId },
      include: {
        charter: {
          select: {
            id: true,
            name: true,
            originAddress: true,
            originLatitude: true,
            originLongitude: true,
            credits: true,
          },
        },
      },
    });

    if (!availability) {
      return {
        success: true,
        data: {
          charterId,
          isAvailable: false,
          message: 'Disponibilidad no configurada',
        },
      };
    }

    // Auto-correct: if charter has insufficient credits but is marked available, reset it
    if (availability.isAvailable && availability.charter.credits < 2) {
      await this.prisma.charterAvailability.update({
        where: { charterId },
        data: { isAvailable: false },
      });
      return {
        success: true,
        data: { ...availability, isAvailable: false },
      };
    }

    // Auto-correct: if the associated vehicle is no longer verified, reset availability
    if (availability.isAvailable && availability.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: availability.vehicleId },
        select: { verificationStatus: true },
      });

      if (!vehicle || vehicle.verificationStatus !== 'verified') {
        await this.prisma.charterAvailability.update({
          where: { charterId },
          data: { isAvailable: false },
        });
        return {
          success: true,
          data: { ...availability, isAvailable: false },
        };
      }
    }

    return {
      success: true,
      data: availability,
    };
  }

  /**
   * Update charter origin location
   */
  async updateCharterOrigin(charterId: string, dto: UpdateCharterOriginDto) {
    const charter = await this.prisma.user.findUnique({
      where: { id: charterId },
    });

    if (!charter || charter.role !== 'charter') {
      throw new NotFoundException('Chófer no encontrado');
    }

    const updated = await this.prisma.user.update({
      where: { id: charterId },
      data: {
        originAddress: dto.originAddress,
        originLatitude: dto.originLatitude,
        originLongitude: dto.originLongitude,
      },
    });

    return {
      success: true,
      message: 'Ubicación de origen actualizada exitosamente',
      data: {
        id: updated.id,
        name: updated.name,
        originAddress: updated.originAddress,
        originLatitude: updated.originLatitude,
        originLongitude: updated.originLongitude,
      },
    };
  }
}
