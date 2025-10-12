import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create feedback for a trip
   */
  async createFeedback(fromUserId: string, dto: CreateFeedbackDto) {
    // Verify trip exists
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: {
        user: true,
        charter: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    // Verify the user was part of this trip
    if (trip.userId !== fromUserId && trip.charterId !== fromUserId) {
      throw new ForbiddenException('Solo puedes dar feedback en tus propios viajes');
    }

    // Verify toUserId is the other party
    if (trip.userId === fromUserId && trip.charterId !== dto.toUserId) {
      throw new BadRequestException('El feedback debe ser para el chófer del viaje');
    }

    if (trip.charterId === fromUserId && trip.userId !== dto.toUserId) {
      throw new BadRequestException('El feedback debe ser para el usuario del viaje');
    }

    // Check if feedback already exists
    const existing = await this.prisma.feedback.findUnique({
      where: {
        tripId_fromUserId: {
          tripId: dto.tripId,
          fromUserId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Ya has dado feedback para este viaje');
    }

    // Create feedback
    const feedback = await this.prisma.feedback.create({
      data: {
        tripId: dto.tripId,
        fromUserId,
        toUserId: dto.toUserId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Feedback creado exitosamente',
      data: feedback,
    };
  }

  /**
   * Get all feedbacks for a user (as recipient)
   */
  async getUserFeedbacks(userId: string) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: {
        toUserId: userId,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
        trip: {
          select: {
            id: true,
            address: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculate average rating
    const totalRating = feedbacks.reduce((sum, f) => sum + f.rating, 0);
    const averageRating = feedbacks.length > 0 ? totalRating / feedbacks.length : 0;

    return {
      success: true,
      data: {
        feedbacks,
        totalCount: feedbacks.length,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        ratingDistribution: {
          5: feedbacks.filter(f => f.rating === 5).length,
          4: feedbacks.filter(f => f.rating === 4).length,
          3: feedbacks.filter(f => f.rating === 3).length,
          2: feedbacks.filter(f => f.rating === 2).length,
          1: feedbacks.filter(f => f.rating === 1).length,
        },
      },
    };
  }

  /**
   * Get feedback for a specific trip
   */
  async getTripFeedbacks(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Viaje no encontrado');
    }

    const feedbacks = await this.prisma.feedback.findMany({
      where: {
        tripId,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      data: feedbacks,
    };
  }

  /**
   * Get feedbacks given by a user
   */
  async getFeedbacksGiven(userId: string) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: {
        fromUserId: userId,
      },
      include: {
        toUser: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
        trip: {
          select: {
            id: true,
            address: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      data: feedbacks,
    };
  }

  /**
   * Check if user can give feedback for a trip
   */
  async canGiveFeedback(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      return {
        canGive: false,
        reason: 'Viaje no encontrado',
      };
    }

    // Check if user was part of the trip
    if (trip.userId !== userId && trip.charterId !== userId) {
      return {
        canGive: false,
        reason: 'No eres parte de este viaje',
      };
    }

    // Check if already gave feedback
    const existing = await this.prisma.feedback.findUnique({
      where: {
        tripId_fromUserId: {
          tripId,
          fromUserId: userId,
        },
      },
    });

    if (existing) {
      return {
        canGive: false,
        reason: 'Ya has dado feedback para este viaje',
      };
    }

    // Determine who should receive the feedback
    const toUserId = trip.userId === userId ? trip.charterId : trip.userId;

    return {
      canGive: true,
      toUserId,
      tripId,
    };
  }
}

