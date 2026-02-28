import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMatchDto,
  SelectCharterDto,
  ToggleAvailabilityDto,
  UpdateCharterOriginDto,
} from './dto';
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
}

@Injectable()
export class TravelMatchingService {
  constructor(
    private prisma: PrismaService,
    private readonly travelMatchingGateway: TravelMatchingGateway,
    private readonly conversationsService: ConversationsService,
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
      dto.maxRadiusKm || 30,
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
        maxRadiusKm: dto.maxRadiusKm || 30,
        workersCount: dto.workersCount || 0,
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
        originLatitude: { not: null },
        originLongitude: { not: null },
        charterAvailability: {
          isAvailable: true,
        },
      },
      include: {
        charterAvailability: true,
      },
    });

    // Filter and calculate distances
    const chartersWithDistance: AvailableCharter[] = [];

    // 🔧 FIX N+1: Load pricing config ONCE before the loop
    const pricingConfig = await this.loadPricingConfig();

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
        });
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

    if (match.status !== 'searching') {
      throw new BadRequestException(
        `La búsqueda está en estado ${match.status}, no se puede seleccionar chófer`,
      );
    }

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
        distanceKm: distances.total,
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
          },
        },
      },
    });

    return updatedMatch;
  }

  /**
   * Charter accepts or rejects a match
   */
  async respondToMatch(charterId: string, matchId: string, accept: boolean) {
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

    const newStatus = accept ? 'accepted' : 'rejected';

    const updatedMatch = await this.prisma.travelMatch.update({
      where: { id: matchId },
      data: { status: newStatus },
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
      },
    });

    if (accept) {
      try {
        // Crear la conversación automáticamente
        const conversationResult = await this.conversationsService.createConversation(matchId);
        const conversation = conversationResult.data;

        // ✅ NUEVO: Guardar conversationId en el match
        await this.prisma.travelMatch.update({
          where: { id: matchId },
          data: { conversationId: conversation.id },
        });
      } catch (error) {
        console.error(
          `❌ Falló la creación automática de la conversación para el match ${matchId}`,
          error,
        );
      }
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

    // Verify user has enough credits
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.credits < (match.estimatedCredits || 0)) {
      throw new BadRequestException(
        `Créditos insuficientes. Requeridos: ${match.estimatedCredits}, Disponibles: ${user.credits}`,
      );
    }

    // Create trip and update match in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct credits
      await tx.user.update({
        where: { id: userId },
        data: {
          credits: {
            decrement: match.estimatedCredits || 0,
          },
        },
      });

      // Create trip
      const trip = await tx.trip.create({
        data: {
          userId,
          charterId: match.charterId!,
          address: match.destinationAddress,
          latitude: match.destinationLatitude,
          longitude: match.destinationLongitude,
          workersCount: match.workersCount,
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

    if (!charter.originLatitude || !charter.originLongitude) {
      throw new BadRequestException(
        'El chófer debe configurar su ubicación de origen antes de estar disponible',
      );
    }

    // Upsert availability
    const availability = await this.prisma.charterAvailability.upsert({
      where: { charterId },
      create: {
        charterId,
        isAvailable: dto.isAvailable,
        lastToggledAt: nowInBuenosAires().toJSDate(),
      },
      update: {
        isAvailable: dto.isAvailable,
        lastToggledAt: nowInBuenosAires().toJSDate(),
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
