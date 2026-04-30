import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, UpdateTripDto, TripResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority } from '@prisma/client';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: TravelMatchingGateway,
    private readonly notificationsService: NotificationsService,
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

  async findAll(
    paginationQuery: PaginationQueryDto,
    userId: string,
    userRole: string,
  ): Promise<PaginatedResponseDto<TripResponseDto>> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    // Construir WHERE clause con filtrado por usuario
    const whereClause: any = { deletedAt: null };

    // Admins y subadmins ven TODOS los trips
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      // Usuarios regulares y charters solo ven SUS trips
      whereClause.OR = [
        { userId: userId },      // Trips donde soy el cliente
        { charterId: userId },   // Trips donde soy el charter
      ];
    }

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where: whereClause,
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
        where: whereClause,
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

  async findOne(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<TripResponseDto> {
    // Construir WHERE con validación de propiedad
    const whereClause: any = { id, deletedAt: null };

    // Admins y subadmins pueden ver cualquier trip
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      // Usuarios regulares y charters solo ven SUS trips
      whereClause.OR = [
        { userId: userId },      // Trips donde soy el cliente
        { charterId: userId },   // Trips donde soy el charter
      ];
    }

    const trip = await this.prisma.trip.findFirst({
      where: whereClause,
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
      throw new NotFoundException('Viaje no encontrado o no tienes permiso para verlo');
    }

    return trip as TripResponseDto;
  }

  async update(
    id: string,
    updateTripDto: UpdateTripDto,
    userId: string,
    userRole: string,
  ): Promise<TripResponseDto> {
    // Validar que el usuario tiene permiso para modificar este trip
    const whereClause: any = { id, deletedAt: null };

    // Admins y subadmins pueden modificar cualquier trip
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      // Usuarios regulares y charters solo pueden modificar SUS trips
      whereClause.OR = [
        { userId: userId },
        { charterId: userId },
      ];
    }

    // Verificar que existe Y que el usuario tiene acceso
    const existingTrip = await this.prisma.trip.findFirst({
      where: whereClause,
    });

    if (!existingTrip) {
      throw new NotFoundException('Viaje no encontrado o no tienes permiso para modificarlo');
    }

    // Proceder con el update
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

  async remove(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    // Validar que el usuario tiene permiso para eliminar este trip
    const whereClause: any = { id, deletedAt: null };

    // Admins y subadmins pueden eliminar cualquier trip
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      // Usuarios regulares y charters solo pueden eliminar SUS trips
      whereClause.OR = [
        { userId: userId },
        { charterId: userId },
      ];
    }

    // Verificar que existe Y que el usuario tiene acceso
    const trip = await this.prisma.trip.findFirst({
      where: whereClause,
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado o no tienes permiso para eliminarlo');
    }

    // Soft delete
    await this.prisma.trip.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(
    userId: string,
    userRole: string,
  ): Promise<TripResponseDto[]> {
    // Construir WHERE clause con filtrado por usuario
    const whereClause: any = { deletedAt: null };

    // Admins y subadmins ven TODOS los trips
    if (userRole !== 'admin' && userRole !== 'subadmin') {
      // Usuarios regulares y charters solo ven SUS trips
      whereClause.OR = [
        { userId: userId },      // Trips donde soy el cliente
        { charterId: userId },   // Trips donde soy el charter
      ];
    }

    const trips = await this.prisma.trip.findMany({
      where: whereClause,
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
    this.gateway.server.to(`user:${trip.userId}`).emit('trip:completed', {
      tripId,
      matchId: updatedTrip.travelMatch?.id,
      status: 'charter_completed',
    });
    this.gateway.server.to(`user:${trip.charterId}`).emit('trip:completed', {
      tripId,
      matchId: updatedTrip.travelMatch?.id,
      status: 'charter_completed',
    });

    // Notificar al cliente que el charter marcó el viaje como completado
    try {
      await this.notificationsService.createOrUpdate({
        userId: trip.userId,
        type: 'trip_charter_completed',
        title: 'El transportista terminó el viaje',
        body: 'Por favor confirmá la finalización del viaje desde tu panel.',
        priority: NotificationPriority.HIGH,
        data: { actionUrl: '/client/dashboard', tripId },
      });
    } catch (err) {
      this.logger.error(`Notificación trip_charter_completed fallida (no crítico): ${err}`);
    }

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

    // Actualizar estado del viaje a completado
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'completed' },
    });

    // Emit WebSocket event to notify both users that trip is completed
    this.gateway.server.to(`user:${trip.userId}`).emit('trip:completed', {
      tripId,
      matchId: trip.travelMatch?.id,
      status: 'completed',
    });
    this.gateway.server.to(`user:${trip.charterId}`).emit('trip:completed', {
      tripId,
      matchId: trip.travelMatch?.id,
      status: 'completed',
    });

    // Notificar al charter que el cliente confirmó la finalización
    try {
      await this.notificationsService.createOrUpdate({
        userId: trip.charterId,
        type: 'trip_completed',
        title: 'Viaje confirmado',
        body: 'El cliente confirmó la finalización del viaje.',
        priority: NotificationPriority.LOW,
        data: { actionUrl: `/driver/trips/${tripId}`, tripId },
      });
    } catch (err) {
      this.logger.error(`Notificación trip_completed fallida (no crítico): ${err}`);
    }

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