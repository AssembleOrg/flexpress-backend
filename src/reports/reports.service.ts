import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { NotificationPriority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReportDto, UpdateReportDto } from './dto';
import { buildResolutionBody } from './reports.constants';
import { nowInBuenosAires } from '../common/utils/date.util';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private conversationsService: ConversationsService,
    private notificationsService: NotificationsService,
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
            credits: true,
            avatar: true,
          },
        },
        reported: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            number: true,
            credits: true,
            avatar: true,
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
   * Update report status (admin only). When resolving with credit actions,
   * runs report update + credit movements in a single atomic transaction and
   * notifies both parties (fire-and-forget).
   */
  async updateReport(reportId: string, adminId: string, dto: UpdateReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, role: true, credits: true } },
        reported: { select: { id: true, role: true, credits: true, deletedAt: true } },
      },
    });

    if (!report) {
      throw new NotFoundException('Reporte no encontrado');
    }

    const creditsToReporter = dto.creditsToReporter ?? 0;
    const creditsFromReported = dto.creditsFromReported ?? 0;
    const creditsToReported = dto.creditsToReported ?? 0;
    const creditsFromReporter = dto.creditsFromReporter ?? 0;
    const hasCreditActions = creditsToReporter > 0 || creditsFromReported > 0 || creditsToReported > 0 || creditsFromReporter > 0;
    const isResolving = dto.status === 'resolved';

    // Validate credit removal from the reported user
    if (isResolving && creditsFromReported > 0) {
      if (report.reported.deletedAt) {
        throw new BadRequestException(
          'El reportado fue eliminado, no se pueden quitar créditos. Desestime el reporte.',
        );
      }
      if (report.reported.credits < creditsFromReported) {
        throw new BadRequestException(
          `El reportado solo tiene ${report.reported.credits} créditos, no se pueden quitar ${creditsFromReported}`,
        );
      }
    }

    // Validate credit removal from the reporter
    if (isResolving && creditsFromReporter > 0) {
      if (report.reporter.credits < creditsFromReporter) {
        throw new BadRequestException(
          `El reportador solo tiene ${report.reporter.credits} créditos, no se pueden quitar ${creditsFromReporter}`,
        );
      }
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

    if (isResolving) {
      data.creditsToReporter = creditsToReporter > 0 ? creditsToReporter : null;
      data.creditsFromReported = creditsFromReported > 0 ? creditsFromReported : null;
      data.creditsToReported = creditsToReported > 0 ? creditsToReported : null;
      data.creditsFromReporter = creditsFromReporter > 0 ? creditsFromReporter : null;
      data.resolvedInFavorOf = dto.resolvedInFavorOf ?? null;
    }

    const applyCredits = isResolving && hasCreditActions;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id: reportId },
        data,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          reported: { select: { id: true, name: true, email: true } },
        },
      });

      if (applyCredits && creditsToReporter > 0) {
        await tx.user.update({
          where: { id: report.reporterId },
          data: { credits: { increment: creditsToReporter } },
        });
      }

      if (applyCredits && creditsFromReported > 0) {
        await tx.user.update({
          where: { id: report.reportedId },
          data: { credits: { decrement: creditsFromReported } },
        });
      }

      if (applyCredits && creditsToReported > 0) {
        await tx.user.update({
          where: { id: report.reportedId },
          data: { credits: { increment: creditsToReported } },
        });
      }

      if (applyCredits && creditsFromReporter > 0) {
        await tx.user.update({
          where: { id: report.reporterId },
          data: { credits: { decrement: creditsFromReporter } },
        });
      }

      return updatedReport;
    });

    this.logger.log(`Reporte ${reportId} actualizado por admin ${adminId}`);

    // Notify both parties when the report reaches a final state (fire-and-forget)
    if (dto.status === 'resolved' || dto.status === 'dismissed') {
      this.notifyResolution(reportId, report.reporter, report.reported, dto);
    }

    return {
      success: true,
      message: 'Reporte actualizado exitosamente',
      data: updated,
    };
  }

  /**
   * Fire-and-forget notification to both parties when a report is resolved/dismissed.
   * actionUrl is role-aware so the deep-link opens the right route + tab.
   */
  private notifyResolution(
    reportId: string,
    reporter: { id: string; role: string },
    reported: { id: string; role: string },
    dto: UpdateReportDto,
  ) {
    const routeFor = (role: string) => (role === 'charter' ? '/driver' : '/client');

    const recipients = [
      {
        forUser: 'reporter' as const,
        userId: reporter.id,
        actionUrl: `${routeFor(reporter.role)}/reports?tab=mine`,
      },
      {
        forUser: 'reported' as const,
        userId: reported.id,
        actionUrl: `${routeFor(reported.role)}/reports?tab=against`,
      },
    ];

    const title = dto.status === 'dismissed' ? 'Reporte desestimado' : 'Reporte resuelto';

    for (const r of recipients) {
      void this.notificationsService
        .createOrUpdate({
          userId: r.userId,
          type: 'report_resolved',
          title,
          body: buildResolutionBody(r.forUser, dto),
          priority: NotificationPriority.HIGH,
          data: { reportId, actionUrl: r.actionUrl },
          dedupeKey: `report_resolved_${reportId}_${r.userId}`,
        })
        .catch((err) => {
          this.logger.error(`Notificación report_resolved fallida (no crítico): ${err}`);
        });
    }
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

