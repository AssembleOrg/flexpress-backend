import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMatchDto,
  SelectCharterDto,
  ToggleAvailabilityDto,
  UpdateCharterOriginDto,
} from './dto';
import { RespondToMatchDto } from './dto/respond-to-match.dto';
import { getCharterCreditCost } from './credit-cost.util';
import {
  calculateTravelDistances,
  parseCoordinates,
  isWithinRadius,
  Coordinates,
} from '../common/utils/distance.util';
import {
  parseDate,
  nowInBuenosAires,
  addMinutes,
} from '../common/utils/date.util';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TravelPricingService,
  DEFAULT_WAIT_BLOCK_MINUTES,
} from './travel-pricing.service';
import { NotificationPriority, VehicleSize } from '@prisma/client';

export interface AvailableCharter {
  charterId: string;
  charterName: string;
  charterAvatar: string | null;
  charterEmail: string;
  charterNumber: string;
  originAddress: string;
  originLatitude: string;
  originLongitude: string;
  distanceToPickup: number;
  totalDistance: number;
  estimatedCredits: number;
  pricePerKm: number | null;
  // Estimado del viaje en PESOS ARS (informativo, aproximado por línea recta).
  // null si el charter no configuró pricePerKm. Desglosado para UX premium.
  pricePerWaitBlock: number | null;
  chargesReturnTrip: boolean;
  estimatedPriceArs: number | null; // total (con mínimo aplicado)
  estimatedPriceIdaArs: number | null; // tramo ida (charter→pickup→destino)
  estimatedPriceWaitArs: number | null; // tramo espera/carga
  estimatedPriceReturnArs: number | null; // tramo vuelta (destino→charter, 50%)
  returnDistanceKm: number | null; // km del tramo de vuelta
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  vehicleYear?: number | null;
  vehicleSize?: VehicleSize | null;
  // Ejecutor activo: el conductor (extra o titular) que representa hoy a la
  // cuenta. Es lo que el cliente ve antes de elegir.
  activeDriverName: string;
  activeDriverPhone: string | null;
  activeDriverAvatar: string | null;
  isTitularDriving: boolean;
  driversCount: number;
  helpersCount: number;
  // true si el charter ya está atendiendo otro viaje (match accepted o trip
  // pending/charter_completed). El charter sigue apareciendo en la lista, pero
  // el frontend muestra badge "En viaje" y el botón cambia a "Consultar disponibilidad".
  isOnTrip: boolean;
}

@Injectable()
export class TravelMatchingService {
  private readonly logger = new Logger(TravelMatchingService.name);

  constructor(
    private prisma: PrismaService,
    private readonly travelMatchingGateway: TravelMatchingGateway,
    private readonly conversationsService: ConversationsService,
    private readonly notificationsService: NotificationsService,
    private readonly pricing: TravelPricingService,
  ) {}

  /**
   * Create a new travel match request
   */
  async createMatch(userId: string, dto: CreateMatchDto) {
    // Verify user exists and has sufficient credits
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Un cliente no verificado no puede pedir viajes. Backstop del gate del front.
    if (user.verificationStatus !== 'verified') {
      throw new ForbiddenException(
        'Tu cuenta está pendiente de verificación. Vas a poder pedir viajes cuando el equipo la apruebe.',
      );
    }

    // El cliente paga 1 crédito al confirmarse el viaje (ver respondToMatch).
    // Validamos acá para no permitir crear búsquedas que nunca podrán cerrarse
    // (ej: recuperación automática tras cancelar/expirar sin créditos).
    if (user.credits < 1) {
      throw new BadRequestException(
        'No tenés créditos suficientes para crear una búsqueda',
      );
    }

    // Unicidad: un cliente no puede tener dos búsquedas vivas a la vez. Al crear
    // una nueva, superseder (cancelar) cualquier búsqueda previa en 'searching'
    // o 'pending' del mismo usuario. Esto cubre los caminos de recuperación
    // automática y evita dobles matches / dobles reservas.
    const supersededPending = await this.prisma.travelMatch.findMany({
      where: { userId, status: 'pending', charterId: { not: null } },
      select: { id: true, charterId: true },
    });
    await this.prisma.travelMatch.updateMany({
      where: { userId, status: { in: ['searching', 'pending'] } },
      data: { status: 'cancelled' },
    });
    // Retractar el pedido a los chóferes que esperaban en las búsquedas
    // superseidas, para que no les quede un pedido fantasma.
    for (const prev of supersededPending) {
      if (!prev.charterId) continue;
      try {
        await this.prisma.notification.updateMany({
          where: {
            userId: prev.charterId,
            type: 'match_selected',
            isRead: false,
            data: { path: ['matchId'], equals: prev.id },
          },
          data: { isRead: true, readAt: new Date() },
        });
        this.travelMatchingGateway.notifyMatchUpdate(prev.charterId, {
          matchId: prev.id,
          status: 'cancelled',
        });
      } catch (err) {
        this.logger.error(
          `Retracción de búsqueda superseida fallida (no crítico): ${err}`,
        );
      }
    }

    // Parse coordinates
    const pickup = parseCoordinates(dto.pickupLatitude, dto.pickupLongitude);
    const destination = parseCoordinates(
      dto.destinationLatitude,
      dto.destinationLongitude,
    );

    // Parse scheduled date if provided
    let scheduledDate: Date | undefined;
    if (dto.scheduledDate) {
      const parsedDate = parseDate(dto.scheduledDate);
      if (parsedDate < nowInBuenosAires()) {
        throw new BadRequestException(
          'La fecha programada debe ser en el futuro',
        );
      }
      scheduledDate = parsedDate.toJSDate();
    }

    // Find available charters within radius
    const availableCharters = await this.findAvailableCharters(
      pickup,
      destination,
      dto.maxRadiusKm || 50,
      dto.workersCount || 0,
    );

    // Create the match
    const match = await this.prisma.travelMatch.create({
      data: {
        userId,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        destinationAddress: dto.destinationAddress,
        destinationLatitude: dto.destinationLatitude,
        destinationLongitude: dto.destinationLongitude,
        maxRadiusKm: dto.maxRadiusKm || 50,
        workersCount: dto.workersCount || 0,
        cargoDescription: dto.cargoDescription ?? null,
        scheduledDate,
        status: 'searching',
        expiresAt: addMinutes(30).toJSDate(), // 30 minutes expiry
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
          },
        },
      },
    });

    return {
      success: true,
      message: `Se encontraron ${availableCharters.length} chóferes disponibles`,
      data: {
        match,
        availableCharters,
      },
    };
  }

  /**
   * Find available charters within radius
   */
  async findAvailableCharters(
    origin: Coordinates,
    destination: Coordinates,
    maxRadiusKm: number,
    workersCount: number = 0,
  ): Promise<AvailableCharter[]> {
    // Get all available charters with origin location set and verified status
    const availableCharters = await this.prisma.user.findMany({
      where: {
        role: 'charter',
        deletedAt: null,
        verificationStatus: 'verified', // Only verified charters can appear in searches
        accountStatus: { not: 'banned' }, // Cuentas bloqueadas no aparecen en búsqueda
        originLatitude: { not: null },
        originLongitude: { not: null },
        credits: { gte: 2 }, // Solo charters con créditos suficientes para aceptar
        charterAvailability: {
          isAvailable: true,
          vehicle: {
            verificationStatus: 'verified',
          },
        },
      },
      include: {
        charterAvailability: {
          include: {
            vehicle: true,
            activeDriver: true,
          },
        },
        _count: {
          select: {
            charterDrivers: {
              where: {
                verificationStatus: 'verified',
                deletedAt: null,
                isEnabled: true,
              },
            },
            charterHelpers: {
              where: {
                verificationStatus: 'verified',
                deletedAt: null,
                isEnabled: true,
              },
            },
          },
        },
      },
    });

    // Filter and calculate distances
    const chartersWithDistance: AvailableCharter[] = [];

    // 🔧 FIX N+1: Load pricing config ONCE before the loop
    const pricingConfig = await this.pricing.loadPricingConfig();
    // Mínimo del estimado en pesos ARS (independiente de los créditos).
    const minPriceArs = await this.pricing.loadMinPriceArs();

    for (const charter of availableCharters) {
      if (!charter.originLatitude || !charter.originLongitude) continue;

      const charterOrigin = parseCoordinates(
        charter.originLatitude,
        charter.originLongitude,
      );

      // Check if charter is within radius of pickup location
      if (isWithinRadius(charterOrigin, origin, maxRadiusKm)) {
        const distances = calculateTravelDistances(
          charterOrigin,
          origin,
          destination,
        );
        // Pass pre-loaded config to avoid N+1 queries
        const estimatedCredits = await this.pricing.calculateCost(
          distances.total,
          workersCount,
          pricingConfig,
        );

        // Estimado en pesos ARS (informativo, paralelo a los créditos).
        const priceArs = this.pricing.calculateEstimatedPriceArs(
          distances.pickupToDestination, // ida = SOLO el viaje del cliente (no se le cobra el traslado del charter hasta el pickup)
          distances.destinationToCharter, // vuelta
          {
            pricePerKm: charter.pricePerKm ?? null,
            pricePerWaitBlock: charter.pricePerWaitBlock ?? null,
            chargesReturnTrip: charter.chargesReturnTrip ?? false,
          },
          minPriceArs,
        );

        // Ejecutor activo (la cara de la oferta): el conductor extra elegido al
        // ponerse disponible, o el titular como fallback. Es lo que el cliente
        // ve ANTES de elegir → transparencia.
        const activeDriver = charter.charterAvailability?.activeDriver;
        const activeDriverName = activeDriver
          ? `${activeDriver.firstName} ${activeDriver.lastName}`.trim()
          : charter.name;
        const activeDriverPhone = activeDriver
          ? (activeDriver.phone ?? null)
          : charter.number;
        const activeDriverAvatar = activeDriver
          ? (activeDriver.photoUrl ?? null)
          : charter.avatar;

        chartersWithDistance.push({
          charterId: charter.id,
          charterName: charter.name,
          charterAvatar: charter.avatar,
          charterEmail: charter.email,
          charterNumber: charter.number,
          originAddress: charter.originAddress || 'Desconocido',
          originLatitude: charter.originLatitude,
          originLongitude: charter.originLongitude,
          distanceToPickup: distances.charterToPickup,
          totalDistance: distances.total,
          estimatedCredits,
          pricePerKm: charter.pricePerKm ?? null,
          pricePerWaitBlock: charter.pricePerWaitBlock ?? null,
          chargesReturnTrip: charter.chargesReturnTrip ?? false,
          estimatedPriceArs: priceArs.total,
          estimatedPriceIdaArs: priceArs.ida,
          estimatedPriceWaitArs: priceArs.wait,
          estimatedPriceReturnArs: priceArs.return,
          returnDistanceKm: distances.destinationToCharter,
          vehicleBrand: charter.charterAvailability?.vehicle?.brand ?? null,
          vehicleModel: charter.charterAvailability?.vehicle?.model ?? null,
          vehiclePlate: charter.charterAvailability?.vehicle?.plate ?? null,
          vehicleYear: charter.charterAvailability?.vehicle?.year ?? null,
          vehicleSize: charter.charterAvailability?.vehicle?.size ?? null,
          activeDriverName,
          activeDriverPhone,
          activeDriverAvatar,
          isTitularDriving: !activeDriver,
          driversCount: (charter as any)._count?.charterDrivers ?? 0,
          helpersCount: (charter as any)._count?.charterHelpers ?? 0,
          isOnTrip: false, // se anota abajo en batch
        });
      }
    }

    // Anotar isOnTrip: un charter está ocupado si tiene un TravelMatch
    // 'accepted' o un Trip activo (pending/charter_completed). El charter
    // sigue devuelto en la lista — el frontend cambia el CTA en lugar de filtrarlo.
    // Deliberadamente NO incluimos match.status='pending' acá: pending significa
    // que aún no respondió y podría rechazar, no que esté en viaje activo.
    if (chartersWithDistance.length > 0) {
      const charterIds = chartersWithDistance.map((c) => c.charterId);
      const [acceptedMatches, activeTrips] = await Promise.all([
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
      ]);
      const busyIds = new Set<string>();
      for (const m of acceptedMatches) if (m.charterId) busyIds.add(m.charterId);
      for (const t of activeTrips) busyIds.add(t.charterId);
      for (const c of chartersWithDistance) {
        c.isOnTrip = busyIds.has(c.charterId);
      }
    }

    // Sort by distance to pickup (closest first)
    return chartersWithDistance.sort(
      (a, b) => a.distanceToPickup - b.distanceToPickup,
    );
  }

  /**
   * User selects a charter for the match
   */
  async selectCharter(userId: string, matchId: string, dto: SelectCharterDto) {
    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      include: { user: true },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    if (match.userId !== userId) {
      throw new ForbiddenException(
        'Solo puedes seleccionar un chófer para tu propia búsqueda',
      );
    }

    // El cliente puede (re)seleccionar mientras el match no tenga efectos
    // irreversibles: 'searching' (primera vez), 'pending' (cambia de chófer sin
    // esperar más) o 'rejected' (el chófer anterior no aceptó). Quedan excluidos
    // 'accepted'/'completed' (créditos ya cobrados + conversación creada) y
    // 'cancelled'. Reseleccionar desde estos estados NO cobra créditos (el cobro
    // ocurre solo al aceptar, ver respondToMatch).
    const RESELECTABLE_STATUSES = ['searching', 'pending', 'rejected'];
    if (!RESELECTABLE_STATUSES.includes(match.status)) {
      throw new BadRequestException(
        `La búsqueda está en estado ${match.status}, no se puede seleccionar chófer`,
      );
    }

    // Si veníamos de una selección previa (pending/rejected) apuntando a otro
    // chófer, guardamos su id para retractarle el pedido fantasma más abajo.
    const previousCharterId =
      match.charterId && match.charterId !== dto.charterId
        ? match.charterId
        : null;

    // Verify charter exists and is available
    const charter = await this.prisma.user.findUnique({
      where: { id: dto.charterId },
      include: { charterAvailability: true },
    });

    if (!charter || charter.role !== 'charter') {
      throw new NotFoundException('Chófer no encontrado');
    }

    if (!charter.charterAvailability?.isAvailable) {
      throw new BadRequestException('El chófer no está disponible');
    }

    // Calculate final cost
    const charterOrigin = parseCoordinates(
      charter.originLatitude!,
      charter.originLongitude!,
    );
    const pickup = parseCoordinates(
      match.pickupLatitude,
      match.pickupLongitude,
    );
    const destination = parseCoordinates(
      match.destinationLatitude,
      match.destinationLongitude,
    );

    const distances = calculateTravelDistances(
      charterOrigin,
      pickup,
      destination,
    );
    const estimatedCredits = await this.pricing.calculateCost(
      distances.total,
      match.workersCount,
    );

    // Update match
    const updatedMatch = await this.prisma.travelMatch.update({
      where: { id: matchId },
      data: {
        charterId: dto.charterId,
        status: 'pending',
        distanceKm: distances.pickupToDestination,
        estimatedCredits,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
            originAddress: true,
            charterAvailability: {
              select: {
                vehicle: {
                  select: {
                    brand: true,
                    model: true,
                    plate: true,
                    year: true,
                    size: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Notificar al charter que fue seleccionado
    try {
      await this.notificationsService.createOrUpdate({
        userId: dto.charterId,
        type: 'match_selected',
        title: 'Nuevo pedido de viaje',
        body: `Un cliente te seleccionó para un viaje. ¡Revisá y respondé!`,
        priority: NotificationPriority.HIGH,
        data: { actionUrl: `/driver/dashboard`, matchId: updatedMatch.id },
      });
    } catch (err) {
      this.logger.error(`Notificación match_selected fallida (no crítico): ${err}`);
    }

    // Reselección: retractar el pedido al chófer anterior para que no le quede
    // un "Nuevo pedido de viaje" fantasma. Marcamos su notificación previa como
    // leída y le avisamos por socket que este match ya no es suyo.
    if (previousCharterId) {
      try {
        await this.prisma.notification.updateMany({
          where: {
            userId: previousCharterId,
            type: 'match_selected',
            isRead: false,
            data: { path: ['matchId'], equals: updatedMatch.id },
          },
          data: { isRead: true, readAt: new Date() },
        });
        this.travelMatchingGateway.notifyMatchUpdate(previousCharterId, {
          matchId: updatedMatch.id,
          status: 'cancelled',
        });
      } catch (err) {
        this.logger.error(
          `Retracción de pedido al chófer anterior fallida (no crítico): ${err}`,
        );
      }
    }

    return updatedMatch;
  }

  /**
   * Charter accepts or rejects a match
   */
  async respondToMatch(charterId: string, matchId: string, dto: RespondToMatchDto) {
    const accept = dto.accept;
    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      include: { user: true, charter: true },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    if (match.charterId !== charterId) {
      throw new ForbiddenException(
        'Solo puedes responder a tus propias solicitudes',
      );
    }

    if (match.status !== 'pending') {
      throw new BadRequestException(
        `La búsqueda está en estado ${match.status}, no se puede responder`,
      );
    }

    if (accept) {
      // Costo escalonado por distancia: se calcula UNA vez y se usa tanto en el
      // guard como en el descuento de la TX, así el monto validado == cobrado.
      const charterCost = getCharterCreditCost(match.distanceKm);

      // Chequeo temprano para dar un error claro y barato. NO alcanza como
      // garantía: entre este read y el descuento no hay lock, así que la
      // validación real se repite como condición del UPDATE dentro de la TX.
      if (!match.charter || match.charter.credits < charterCost) {
        throw new BadRequestException(
          `Necesitás al menos ${charterCost} créditos para aceptar esta solicitud`,
        );
      }
      if (!match.user || match.user.credits < 1) {
        throw new BadRequestException(
          'El cliente no tiene créditos suficientes para completar la solicitud',
        );
      }

      // El personal del viaje YA fue elegido por el charter al ponerse
      // disponible (config activa en CharterAvailability). Aquí solo lo leemos
      // para armar el snapshot inmutable: lo que el cliente vio = lo que viene.
      const availability = await this.prisma.charterAvailability.findUnique({
        where: { charterId },
        select: { activeDriverId: true, activeHelperIds: true },
      });

      let driverEntity: { id: string; firstName: string; lastName: string; phone: string | null } | null = null;
      if (availability?.activeDriverId) {
        const driver = await this.prisma.charterDriver.findFirst({
          where: { id: availability.activeDriverId, charterId, deletedAt: null },
        });
        // Si la config quedó inconsistente (conductor borrado), caemos al
        // titular en vez de fallar: el viaje sigue siendo de la cuenta.
        if (driver) {
          driverEntity = {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            phone: driver.phone,
          };
        }
      }

      const helperEntities: Array<{ id: string; firstName: string; lastName: string }> = [];
      const activeHelperIds = availability?.activeHelperIds ?? [];
      if (activeHelperIds.length > 0) {
        const helpers = await this.prisma.charterHelper.findMany({
          where: { id: { in: activeHelperIds }, charterId, deletedAt: null },
        });
        for (const h of helpers) {
          helperEntities.push({ id: h.id, firstName: h.firstName, lastName: h.lastName });
        }
      }

      const snapshot = {
        driver: driverEntity
          ? {
              id: driverEntity.id,
              name: `${driverEntity.firstName} ${driverEntity.lastName}`.trim(),
              phone: driverEntity.phone ?? undefined,
            }
          : { id: null, name: `${match.charter.name} (titular)`, phone: match.charter.number },
        helpers: helperEntities.map((h) => ({
          id: h.id,
          name: `${h.firstName} ${h.lastName}`.trim(),
        })),
      };

      // TX atómica: reclamar el match + descontar créditos + crear TripPersonnel.
      //
      // Cada escritura lleva su condición en el WHERE en vez de confiar en los
      // reads de arriba: en READ COMMITTED Postgres bloquea la fila y reevalúa
      // el WHERE después del lock, así que `count !== 1` significa que otro
      // request ganó la carrera. Con la validación en JS, dos aceptaciones
      // concurrentes pasaban ambas y dejaban los créditos en negativo.
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.travelMatch.updateMany({
          where: { id: matchId, status: 'pending' },
          data: { status: 'accepted' },
        });
        if (claimed.count !== 1) {
          throw new ConflictException('Esta solicitud ya fue respondida');
        }

        const charterCharged = await tx.user.updateMany({
          where: { id: charterId, credits: { gte: charterCost } },
          data: { credits: { decrement: charterCost } },
        });
        if (charterCharged.count !== 1) {
          throw new BadRequestException(
            `Necesitás al menos ${charterCost} créditos para aceptar esta solicitud`,
          );
        }

        const userCharged = await tx.user.updateMany({
          where: { id: match.userId, credits: { gte: 1 } },
          data: { credits: { decrement: 1 } },
        });
        if (userCharged.count !== 1) {
          throw new BadRequestException(
            'El cliente no tiene créditos suficientes para completar la solicitud',
          );
        }

        await tx.tripPersonnel.create({
          data: {
            matchId,
            driverId: driverEntity?.id ?? null,
            helperIds: helperEntities.map((h) => h.id),
            snapshot: snapshot as any,
          },
        });
      });
    }

    // Si fue rechazado, actualizar el estado ahora (el aceptado ya se hizo en la TX)
    if (!accept) {
      const rejected = await this.prisma.travelMatch.updateMany({
        where: { id: matchId, status: 'pending' },
        data: { status: 'rejected' },
      });
      if (rejected.count !== 1) {
        throw new ConflictException('Esta solicitud ya fue respondida');
      }
    }

    if (accept) {
      // Crear la conversación y vincularla al match ANTES de devolver el match,
      // para que la respuesta incluya siempre el conversationId. createConversation
      // es idempotente: si ya existe, devuelve la existente.
      const conversationResult =
        await this.conversationsService.createConversation(matchId);
      const conversation = conversationResult.data;

      await this.prisma.travelMatch.update({
        where: { id: matchId },
        data: { conversationId: conversation.id },
      });
    }

    const updatedMatch = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
            originAddress: true,
          },
        },
        conversation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        personnel: true,
      },
    });

    if (!updatedMatch) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    // Notificar al cliente (user) sobre el cambio de estado.
    // Esto se hace después de que la base de datos se ha actualizado con éxito.
    if (
      updatedMatch.status === 'accepted' ||
      updatedMatch.status === 'rejected'
    ) {
      this.travelMatchingGateway.notifyMatchUpdate(updatedMatch.userId, {
        matchId: updatedMatch.id,
        status: updatedMatch.status,
      });

      const isAccepted = updatedMatch.status === 'accepted';
      try {
        await this.notificationsService.createOrUpdate({
          userId: updatedMatch.userId,
          type: isAccepted ? 'match_accepted' : 'match_rejected',
          title: isAccepted ? '¡Tu viaje fue aceptado!' : 'Viaje rechazado',
          body: isAccepted
            ? `${updatedMatch.charter?.name ?? 'El chófer'} aceptó tu solicitud. Ya podés chatear.`
            : `${updatedMatch.charter?.name ?? 'El chófer'} rechazó tu solicitud. Podés buscar otro.`,
          priority: NotificationPriority.HIGH,
          data: { actionUrl: isAccepted ? `/client/trips/matching/${updatedMatch.id}` : '/client/dashboard', matchId: updatedMatch.id },
        });
      } catch (err) {
        this.logger.error(`Notificación ${updatedMatch.status} fallida (no crítico): ${err}`);
      }
    }

    return updatedMatch;
  }

  /**
   * Convert accepted match to actual trip
   */
  async createTripFromMatch(userId: string, matchId: string) {
    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      include: { user: true, charter: true },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    if (match.userId !== userId) {
      throw new ForbiddenException(
        'Solo puedes crear un viaje desde tu propia búsqueda',
      );
    }

    if (match.status !== 'accepted') {
      throw new BadRequestException(
        'La búsqueda debe ser aceptada antes de crear el viaje',
      );
    }

    if (!match.charterId) {
      throw new BadRequestException(
        'No hay chófer seleccionado para esta búsqueda',
      );
    }

    if (match.tripId) {
      throw new BadRequestException('Ya existe un viaje para esta búsqueda');
    }

    // Create trip and update match in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create trip
      const trip = await tx.trip.create({
        data: {
          userId,
          charterId: match.charterId!,
          address: match.destinationAddress,
          latitude: match.destinationLatitude,
          longitude: match.destinationLongitude,
          workersCount: match.workersCount,
          cargoDescription: match.cargoDescription,
          scheduledDate: match.scheduledDate,
        },
      });

      // El match se reclama con `tripId: null` en el WHERE: si otro request ya
      // creó el viaje, count es 0 y el rollback descarta el Trip de esta TX.
      // Sin la condición, dos llamadas concurrentes dejaban dos filas Trip y
      // el match apuntando a una sola (la otra quedaba huérfana).
      const linked = await tx.travelMatch.updateMany({
        where: { id: matchId, status: 'accepted', tripId: null },
        data: {
          status: 'completed',
          tripId: trip.id,
        },
      });
      if (linked.count !== 1) {
        throw new ConflictException('Ya existe un viaje para esta búsqueda');
      }

      // El chat del viaje no debe expirar/borrarse mientras el viaje exista.
      // Archivarlo lo excluye del cron de limpieza (filtra por isArchived: false).
      if (match.conversationId) {
        await tx.conversation.update({
          where: { id: match.conversationId },
          data: { isArchived: true },
        });
      }

      return trip;
    });

    return {
      success: true,
      message: 'Viaje creado exitosamente',
      data: result,
    };
  }

  /**
   * Get match details
   */
  async getMatch(matchId: string) {
    // Auto-reparación: si el match no tiene conversationId pero existe una
    // Conversation vinculada por matchId (caso histórico de matches huérfanos),
    // escribir el scalar para que la relación se resuelva correctamente.
    const matchLink = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      select: { id: true, conversationId: true },
    });
    if (matchLink && !matchLink.conversationId) {
      const orphanConversation = await this.prisma.conversation.findUnique({
        where: { matchId },
        select: { id: true },
      });
      if (orphanConversation) {
        await this.prisma.travelMatch.update({
          where: { id: matchId },
          data: { conversationId: orphanConversation.id },
        });
      }
    }

    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
            originAddress: true,
            charterAvailability: {
              select: {
                vehicle: {
                  select: {
                    brand: true,
                    model: true,
                    plate: true,
                    year: true,
                    size: true,
                  },
                },
              },
            },
          },
        },
        trip: true,
        conversation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        personnel: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    return {
      success: true,
      data: match,
    };
  }

  /**
   * Get user's matches
   */
  async getUserMatches(userId: string, status?: string) {
    const where: any = {
      userId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const matches = await this.prisma.travelMatch.findMany({
      where,
      include: {
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
            originAddress: true,
          },
        },
        conversation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        trip: {
          select: {
            id: true,
            status: true,
            userId: true,
            charterId: true,
            address: true,
            latitude: true,
            longitude: true,
            workersCount: true,
            scheduledDate: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        personnel: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: matches,
    };
  }

  /**
   * Get charter's match requests
   */
  async getCharterMatches(charterId: string, status?: string) {
    const where: any = {
      charterId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const matches = await this.prisma.travelMatch.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            number: true,
            avatar: true,
          },
        },
        conversation: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        trip: {
          select: {
            id: true,
            status: true,
            userId: true,
            charterId: true,
            address: true,
            latitude: true,
            longitude: true,
            workersCount: true,
            scheduledDate: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        personnel: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: matches,
    };
  }

  /**
   * Cancel a match
   */
  async cancelMatch(userId: string, matchId: string) {
    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    if (match.userId !== userId) {
      throw new ForbiddenException(
        'Solo puedes cancelar tus propias búsquedas',
      );
    }

    if (['completed', 'cancelled'].includes(match.status)) {
      throw new BadRequestException(
        `No se puede cancelar una búsqueda ${match.status}`,
      );
    }

    const updated = await this.prisma.travelMatch.update({
      where: { id: matchId },
      data: { status: 'cancelled' },
    });

    // Si había un chófer con el pedido pendiente, avisarle que el cliente
    // canceló para que no le quede un pedido fantasma (retracta su notificación
    // y le emite el cambio de estado por socket).
    if (match.status === 'pending' && match.charterId) {
      try {
        await this.prisma.notification.updateMany({
          where: {
            userId: match.charterId,
            type: 'match_selected',
            isRead: false,
            data: { path: ['matchId'], equals: updated.id },
          },
          data: { isRead: true, readAt: new Date() },
        });
        this.travelMatchingGateway.notifyMatchUpdate(match.charterId, {
          matchId: updated.id,
          status: 'cancelled',
        });
      } catch (err) {
        this.logger.error(
          `Aviso de cancelación al chófer fallido (no crítico): ${err}`,
        );
      }
    }

    return {
      success: true,
      message: 'Búsqueda cancelada exitosamente',
      data: updated,
    };
  }
}
