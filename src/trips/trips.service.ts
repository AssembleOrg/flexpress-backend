import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, UpdateTripDto, TripResponseDto } from './dto';
import { PaginationQueryDto, PaginatedResponseDto } from '../common/dto';

@Injectable()
export class TripsService {
  constructor(private prisma: PrismaService) {}

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
      },
    });

    return trips as TripResponseDto[];
  }
} 