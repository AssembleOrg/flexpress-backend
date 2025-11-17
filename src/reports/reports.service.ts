import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateReportDto, UpdateReportDto } from './dto';
import { nowInBuenosAires } from '../common/utils/date.util';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
  ) {}

  /**
   * Create a report and archive the conversation
   */
  async createReport(reporterId: string, dto: CreateReportDto) {
    // Verify conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: {
        user: true,
        charter: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    // Verify reporter is part of conversation
    if (conversation.userId !== reporterId && conversation.charterId !== reporterId) {
      throw new ForbiddenException('No eres parte de esta conversación');
    }

    // Verify reported user is the other party
    if (conversation.userId === reporterId && conversation.charterId !== dto.reportedId) {
      throw new BadRequestException('Solo puedes reportar al chófer de esta conversación');
    }

    if (conversation.charterId === reporterId && conversation.userId !== dto.reportedId) {
      throw new BadRequestException('Solo puedes reportar al usuario de esta conversación');
    }

    // Check if already reported
    const existing = await this.prisma.report.findFirst({
      where: {
        conversationId: dto.conversationId,
        reporterId,
      },
    });

    if (existing) {
      throw new BadRequestException('Ya has reportado esta conversación');
    }

    // Archive conversation to prevent auto-deletion
    await this.conversationsService.archiveConversation(dto.conversationId);

    // Create report
    const report = await this.prisma.report.create({
      data: {
        conversationId: dto.conversationId,
        reporterId,
        reportedId: dto.reportedId,
        reason: dto.reason,
        description: dto.description,
        status: 'pending',
      },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        conversation: {
          select: {
            id: true,
            matchId: true,
            createdAt: true,
          },
        },
      },
    });

    this.logger.log(`Reporte creado: ${report.id} por ${reporterId} contra ${dto.reportedId}`);

    return {
      success: true,
      message: 'Reporte enviado exitosamente. La conversación ha sido guardada para revisión.',
      data: report,
    };
  }

  /**
   * Get all reports (admin only)
   */
  async getAllReports(status?: string) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    const reports = await this.prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        conversation: {
          select: {
            id: true,
            matchId: true,
            createdAt: true,
            _count: {
              select: {
                messages: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: reports,
    };
  }

  /**
   * Get report details with conversation history
   */
  async getReportDetails(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            number: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            number: true,
          },
        },
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              include: {
                sender: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                  },
                },
              },
            },
            travelMatch: {
              select: {
                id: true,
                pickupAddress: true,
                destinationAddress: true,
                scheduledDate: true,
                workersCount: true,
                estimatedCredits: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Reporte no encontrado');
    }

    return {
      success: true,
      data: report,
    };
  }

  /**
   * Update report status (admin only)
   */
  async updateReport(reportId: string, adminId: string, dto: UpdateReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Reporte no encontrado');
    }

    const data: any = {};

    if (dto.status) {
      data.status = dto.status;

      if (dto.status === 'resolved' || dto.status === 'dismissed') {
        data.resolvedAt = nowInBuenosAires().toJSDate();
        data.resolvedBy = adminId;
      }
    }

    if (dto.adminNotes !== undefined) {
      data.adminNotes = dto.adminNotes;
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data,
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Reporte ${reportId} actualizado por admin ${adminId}`);

    return {
      success: true,
      message: 'Reporte actualizado exitosamente',
      data: updated,
    };
  }

  /**
   * Get reports made by a user
   */
  async getUserReports(userId: string) {
    const reports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      include: {
        reported: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        conversation: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: reports,
    };
  }

  /**
   * Get reports received by a user
   */
  async getReportsAgainstUser(userId: string) {
    const reports = await this.prisma.report.findMany({
      where: { reportedId: userId },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        conversation: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: reports,
    };
  }
}

