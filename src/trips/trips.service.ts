import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, UpdateTripDto, TripResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private gateway: TravelMatchingGateway,
  ) {}

  async create(createTripDto: CreateTripDto): Promise<TripResponseDto> {
    const trip = await this.prisma.trip.create({
      data: createTripDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
            pickupAddress: true,
            destinationAddress: true,
            estimatedCredits: true,
            distanceKm: true,
          },
        },
      },
    });

    return trip as TripResponseDto;
  }

  async findAll(paginationQuery: PaginationQueryDto): Promise<PaginatedResponseDto<TripResponseDto>> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
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
          charter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          travelMatch: {
            select: {
              id: true,
              pickupAddress: true,
              destinationAddress: true,
              estimatedCredits: true,
              distanceKm: true,
            },
          },
        },
      }),
      this.prisma.trip.count({
        where: { deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data: trips as TripResponseDto[],
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

  async findOne(id: string): Promise<TripResponseDto> {
    const trip = await this.prisma.trip.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
            pickupAddress: true,
            destinationAddress: true,
            estimatedCredits: true,
            distanceKm: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    return trip as TripResponseDto;
  }

  async update(id: string, updateTripDto: UpdateTripDto): Promise<TripResponseDto> {
    const trip = await this.prisma.trip.findFirst({
      where: { id, deletedAt: null },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id },
      data: updateTripDto,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
            pickupAddress: true,
            destinationAddress: true,
            estimatedCredits: true,
            distanceKm: true,
          },
        },
      },
    });

    return updatedTrip as TripResponseDto;
  }

  async remove(id: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({
      where: { id, deletedAt: null },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Soft delete
    await this.prisma.trip.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(): Promise<TripResponseDto[]> {
    const trips = await this.prisma.trip.findMany({
      where: { deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
            pickupAddress: true,
            destinationAddress: true,
            estimatedCredits: true,
            distanceKm: true,
          },
        },
      },
    });

    return trips as TripResponseDto[];
  }

  /**
   * Charter marks trip as completed (charter_completed status)
   * Trip moves from 'pending' to 'charter_completed'
   */
  async charterCompleteTrip(tripId: string, charterId: string): Promise<TripResponseDto> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Verify charter owns this trip
    if (trip.charterId !== charterId) {
      throw new NotFoundException('No tienes permiso para finalizar este viaje');
    }

    // Verify trip is in pending status
    if (trip.status !== 'pending') {
      throw new NotFoundException('El viaje no está en estado pendiente');
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'charter_completed' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
          },
        },
      },
    });

    // Emit WebSocket event to notify both users
    this.gateway.server.to(trip.userId).emit('trip:completed', {
      tripId,
      matchId: updatedTrip.travelMatch?.id,
      status: 'charter_completed',
    });
    this.gateway.server.to(trip.charterId).emit('trip:completed', {
      tripId,
      matchId: updatedTrip.travelMatch?.id,
      status: 'charter_completed',
    });

    return updatedTrip as TripResponseDto;
  }

  /**
   * Client confirms completion and triggers credit transfer
   * Trip moves from 'charter_completed' to 'completed'
   */
  async clientConfirmCompletion(tripId: string, userId: string): Promise<TripResponseDto> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, deletedAt: null },
      include: {
        travelMatch: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Verify client owns this trip
    if (trip.userId !== userId) {
      throw new NotFoundException('No tienes permiso para confirmar este viaje');
    }

    // Verify trip is in charter_completed status
    if (trip.status !== 'charter_completed') {
      throw new NotFoundException('El transportista aún no ha finalizado el viaje');
    }

    // Get estimated credits from travel match
    const estimatedCredits = trip.travelMatch?.estimatedCredits || 0;

    // Transfer credits: deduct from user, add to charter
    await this.prisma.$transaction([
      // Update trip status to completed
      this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'completed' },
      }),
      // Deduct credits from user (already reserved when trip was created)
      // Credits were already deducted when trip was created, so no need to deduct again
      // Add credits to charter
      this.prisma.user.update({
        where: { id: trip.charterId },
        data: {
          credits: {
            increment: estimatedCredits,
          },
        },
      }),
    ]);

    // Emit WebSocket event to notify both users that trip is completed
    this.gateway.server.to(trip.userId).emit('trip:completed', {
      tripId,
      matchId: trip.travelMatch?.id,
      status: 'completed',
    });
    this.gateway.server.to(trip.charterId).emit('trip:completed', {
      tripId,
      matchId: trip.travelMatch?.id,
      status: 'completed',
    });

    // Fetch updated trip to return
    const updatedTrip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        travelMatch: {
          select: {
            id: true,
            pickupAddress: true,
            destinationAddress: true,
            estimatedCredits: true,
            distanceKm: true,
          },
        },
      },
    });

    return updatedTrip as TripResponseDto;
  }
} 