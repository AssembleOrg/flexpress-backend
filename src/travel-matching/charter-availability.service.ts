import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToggleAvailabilityDto, UpdateCharterOriginDto } from './dto';
import { nowInBuenosAires } from '../common/utils/date.util';
import { ActivityLogService } from '../common/services/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';

const HOUR_MS = 60 * 60 * 1000;
/** Sin abrir la app ni tocar el toggle durante este tiempo → "¿Seguís disponible?". */
const STALE_WARNING_AFTER_MS = 24 * HOUR_MS;
/** Margen entre el aviso y el apagado, para que pueda responder abriendo la app. */
const STALE_GRACE_MS = 2 * HOUR_MS;
export const STALE_WARNING_TYPE = 'availability_stale_warning';
export const AUTO_OFF_TYPE = 'availability_auto_off';

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
  private readonly logger = new Logger(CharterAvailabilityService.name);

  constructor(
    private prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    await this.activityLog.logFeature({
      userId: charterId,
      entityType: 'CharterAvailability',
      entityId: availability.id,
      feature: 'Cambió su disponibilidad',
      status: dto.isAvailable ? 'available' : 'unavailable',
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

  /**
   * "Disponible" no vence solo: un charter que dejó el celular en un cajón
   * seguía apareciendo en la búsqueda y el cliente esperaba un match que nunca
   * iba a responderse. Cada hora:
   *
   *  1. Inactivo 24h (sin abrir la app ni tocar el toggle) → aviso "¿Seguís
   *     disponible?" (push + campana). Abrir la app ya cuenta como respuesta.
   *  2. Si 2h después del aviso sigue sin actividad → se lo pasa a No disponible
   *     y se le avisa.
   *
   * Actividad = `lastLoginAt` (se actualiza en cada refresh, ~cada 15 min con la
   * app abierta) o `lastToggledAt`. El aviso mismo es el estado: no hay columna
   * nueva, se busca la notificación de aviso posterior a la última actividad.
   * Los que están en viaje (match aceptado o trip activo) no se tocan.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleAvailability(): Promise<void> {
    const now = Date.now();
    const warnCutoff = new Date(now - STALE_WARNING_AFTER_MS);

    const candidates = await this.prisma.charterAvailability.findMany({
      where: {
        isAvailable: true,
        lastToggledAt: { lt: warnCutoff },
        charter: {
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: warnCutoff } }],
        },
      },
      select: {
        id: true,
        charterId: true,
        lastToggledAt: true,
        charter: { select: { lastLoginAt: true } },
      },
    });
    if (candidates.length === 0) return;

    const charterIds = candidates.map((c) => c.charterId);
    // Misma regla que `isOnTrip` en la búsqueda (travel-matching.service).
    const [acceptedMatches, activeTrips, warnings] = await Promise.all([
      this.prisma.travelMatch.findMany({
        where: { charterId: { in: charterIds }, status: 'accepted', deletedAt: null },
        select: { charterId: true },
      }),
      this.prisma.trip.findMany({
        where: {
          charterId: { in: charterIds },
          status: { in: ['pending', 'charter_completed'] },
          deletedAt: null,
        },
        select: { charterId: true },
      }),
      this.prisma.notification.findMany({
        where: { userId: { in: charterIds }, type: STALE_WARNING_TYPE },
        orderBy: { createdAt: 'desc' },
        distinct: ['userId'],
        select: { userId: true, createdAt: true },
      }),
    ]);
    const busy = new Set<string>();
    for (const m of acceptedMatches) if (m.charterId) busy.add(m.charterId);
    for (const t of activeTrips) busy.add(t.charterId);
    const lastWarning = new Map(warnings.map((w) => [w.userId, w.createdAt]));

    let warned = 0;
    let turnedOff = 0;
    for (const c of candidates) {
      if (busy.has(c.charterId)) continue;
      try {
        const lastActivity = Math.max(
          c.lastToggledAt.getTime(),
          c.charter.lastLoginAt?.getTime() ?? 0,
        );
        const warning = lastWarning.get(c.charterId);

        if (!warning || warning.getTime() <= lastActivity) {
          await this.notificationsService.createOrUpdate({
            userId: c.charterId,
            type: STALE_WARNING_TYPE,
            title: '¿Seguís disponible?',
            body: 'Hace un día que no abrís Flexpress. Entrá para seguir recibiendo pedidos o te pasamos a No disponible.',
            priority: NotificationPriority.HIGH,
            data: { actionUrl: '/driver/dashboard' },
          });
          warned++;
          continue;
        }

        if (now - warning.getTime() < STALE_GRACE_MS) continue;

        // Condicional: si entre la lectura y acá abrió la app o tocó el toggle,
        // no matchea y no se apaga.
        const { count } = await this.prisma.charterAvailability.updateMany({
          where: {
            id: c.id,
            isAvailable: true,
            lastToggledAt: c.lastToggledAt,
            charter: {
              OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: warning } }],
            },
          },
          data: { isAvailable: false },
        });
        if (count === 0) continue;

        await this.activityLog.logFeature({
          userId: c.charterId,
          entityType: 'CharterAvailability',
          entityId: c.id,
          feature: 'Disponibilidad apagada por inactividad',
          status: 'unavailable',
        });
        await this.notificationsService.createOrUpdate({
          userId: c.charterId,
          type: AUTO_OFF_TYPE,
          title: 'Te pasamos a No disponible',
          body: 'No tuvimos noticias tuyas en más de un día. Cuando vuelvas a estar listo, activate desde tu panel.',
          priority: NotificationPriority.HIGH,
          data: { actionUrl: '/driver/dashboard' },
        });
        turnedOff++;
      } catch (err) {
        this.logger.warn(
          `Inactividad de ${c.charterId} fallida (se reintenta en 1h): ${err}`,
        );
      }
    }

    if (warned || turnedOff) {
      this.logger.log(
        `Disponibilidad por inactividad: ${warned} avisados, ${turnedOff} apagados`,
      );
    }
  }
}
