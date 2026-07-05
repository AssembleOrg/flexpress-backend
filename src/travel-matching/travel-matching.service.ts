import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
import { ConversationsService } from 'src/conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority, VehicleSize } from '@prisma/client';

// Estimado del viaje en PESOS ARS (informativo). Estos defaults aplican si no
// hay config en SystemConfig. NO se mezclan con los créditos (matching).
const DEFAULT_MIN_PRICE_ARS = 20000; // mínimo de todo viaje
const DEFAULT_WAIT_BLOCK_MINUTES = 30; // duración del bloque de espera fija
const RETURN_TRIP_FACTOR = 0.5; // la vuelta se cobra al 50% del $/km

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
    const pricingConfig = await this.loadPricingConfig();
    // Mínimo del estimado en pesos ARS (independiente de los créditos).
    const minPriceArs = await this.loadMinPriceArs();

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
        const estimatedCredits = await this.calculateCost(
          distances.total,
          workersCount,
          pricingConfig,
        );

        // Estimado en pesos ARS (informativo, paralelo a los créditos).
        const priceArs = this.calculateEstimatedPriceArs(
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
   * Load pricing configuration from database (call once, reuse)
   */
  private async loadPricingConfig(): Promise<{
    baseRate: number;
    minimumCharge: number;
    workerRate: number;
  }> {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: 'pricing_',
        },
      },
    });

    // Default pricing
    let baseRate = 1; // credits per km
    let minimumCharge = 5; // minimum credits
    let workerRate = 50; // credits per worker

    for (const config of configs) {
      if (config.key === 'pricing_base_rate_per_km') {
        baseRate = parseFloat(config.value);
      } else if (config.key === 'pricing_minimum_charge') {
        minimumCharge = parseFloat(config.value);
      } else if (config.key === 'pricing_worker_rate') {
        workerRate = parseFloat(config.value);
      }
    }

    return { baseRate, minimumCharge, workerRate };
  }

  /**
   * Mínimo del estimado en PESOS ARS. Reusa la clave 'pricing_minimum_charge'
   * (cuyo significado pasó a ser pesos; ya no alimenta ningún cobro en créditos).
   */
  private async loadMinPriceArs(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'pricing_minimum_charge' },
    });
    const value = config ? parseFloat(config.value) : NaN;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MIN_PRICE_ARS;
  }

  /**
   * Calculate cost based on distance, workers and pricing config
   * @param pricingConfig - Pre-loaded pricing config (optional, will load if not provided)
   */
  async calculateCost(
    distanceKm: number,
    workersCount: number = 0,
    pricingConfig?: { baseRate: number; minimumCharge: number; workerRate: number },
  ): Promise<number> {
    // Use pre-loaded config or load it (for backwards compatibility)
    const config = pricingConfig || await this.loadPricingConfig();

    // Calculate distance cost
    const distanceCost = Math.ceil(distanceKm * config.baseRate);

    // Calculate worker cost
    const workerCost = workersCount * config.workerRate;

    // Total cost
    const totalCost = distanceCost + workerCost;

    return Math.max(totalCost, config.minimumCharge);
  }

  /**
   * Estimado del viaje en PESOS ARS (informativo, aproximado por línea recta).
   * Independiente de los créditos (que son solo comisión de matchmaking).
   *
   *   ida    = (pickup→destino) × pricePerKm  ← SOLO el viaje del cliente; no se
   *            le cobra el traslado del charter hasta el pickup.
   *   espera = pricePerWaitBlock (1 bloque fijo por viaje; 0 si no cobra)
   *   vuelta = (destino→charter) × pricePerKm × 0.5  (solo si chargesReturnTrip)
   *   total  = max(ida, mínimo $20.000)
   *
   * El `total` que ve el cliente es SOLO la ida pickup→destino (aproximado por
   * km, coincide con la "distancia estimada" que se le muestra). Espera y vuelta
   * se siguen calculando y se devuelven aparte (wait/return) pero NO suman al
   * total mostrado: son posibles recargos que el cliente coordina con el
   * charter, no un desglose sumado.
   *
   * Devuelve null en todos los campos si el charter no configuró pricePerKm.
   */
  private calculateEstimatedPriceArs(
    idaKm: number,
    returnKm: number,
    charter: {
      pricePerKm: number | null;
      pricePerWaitBlock: number | null;
      chargesReturnTrip: boolean;
    },
    minPriceArs: number,
  ): {
    total: number | null;
    ida: number | null;
    wait: number | null;
    return: number | null;
  } {
    // Sin tarifa por km configurada → no hay estimado (no se muestra).
    if (charter.pricePerKm == null || charter.pricePerKm <= 0) {
      return { total: null, ida: null, wait: null, return: null };
    }

    const pricePerKm = charter.pricePerKm;
    const ida = idaKm * pricePerKm;
    const wait = charter.pricePerWaitBlock ?? 0;
    const ret = charter.chargesReturnTrip
      ? returnKm * pricePerKm * RETURN_TRIP_FACTOR
      : 0;

    // El cliente solo ve el aproximado de la ida (con mínimo). Espera y vuelta
    // se devuelven aparte pero no suman al total mostrado.
    const total = Math.max(ida, minPriceArs);

    return {
      total: Math.round(total),
      ida: Math.round(ida),
      wait: Math.round(wait),
      return: Math.round(ret),
    };
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
    const estimatedCredits = await this.calculateCost(
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

      // Verificar créditos suficientes antes de aceptar
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

      // TX atómica: descontar créditos + actualizar estado + crear TripPersonnel
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: charterId },
          data: { credits: { decrement: charterCost } },
        });
        await tx.user.update({
          where: { id: match.userId },
          data: { credits: { decrement: 1 } },
        });
        await tx.travelMatch.update({
          where: { id: matchId },
          data: { status: 'accepted' },
        });
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
      await this.prisma.travelMatch.update({
        where: { id: matchId },
        data: { status: 'rejected' },
      });
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

      // Update match
      await tx.travelMatch.update({
        where: { id: matchId },
        data: {
          status: 'completed',
          tripId: trip.id,
        },
      });

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
