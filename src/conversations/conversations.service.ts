import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SendMessageDto } from './dto';
import { addHours, nowInBuenosAires } from '../common/utils/date.util';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationPriority } from '@prisma/client';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TravelMatchingGateway))
    private gateway: TravelMatchingGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a conversation when match is accepted
   */
  async createConversation(matchId: string) {
    const match = await this.prisma.travelMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Búsqueda no encontrada');
    }

    if (match.status !== 'accepted' && match.status !== 'completed') {
      throw new BadRequestException(
        'La búsqueda debe estar aceptada para abrir conversación',
      );
    }

    if (!match.charterId) {
      throw new BadRequestException('No hay chófer asignado');
    }

    // Check if conversation already exists
    const existing = await this.prisma.conversation.findUnique({
      where: { matchId },
    });

    if (existing) {
      return {
        success: true,
        message: 'Conversación ya existe',
        data: existing,
      };
    }

    // Create conversation with 5-hour expiration. Si el viaje ya existe
    // (match completed), nace archivada para que el cron no la borre.
    const conversation = await this.prisma.conversation.create({
      data: {
        matchId,
        userId: match.userId,
        charterId: match.charterId,
        status: 'active',
        expiresAt: addHours(5).toJSDate(),
        isArchived: match.status === 'completed',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    this.logger.log(
      `Conversación creada: ${conversation.id} para match ${matchId}`,
    );

    return {
      success: true,
      message: 'Canal de comunicación abierto',
      data: conversation,
    };
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        user: true,
        charter: true,
        travelMatch: { select: { id: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    // Verify sender is part of conversation
    if (
      conversation.userId !== senderId &&
      conversation.charterId !== senderId
    ) {
      throw new ForbiddenException('No eres parte de esta conversación');
    }

    // Check if conversation is active
    if (conversation.status !== 'active') {
      throw new BadRequestException(
        `La conversación está ${conversation.status}`,
      );
    }

    // Check if expired
    if (conversation.expiresAt < nowInBuenosAires().toJSDate()) {
      await this.expireConversation(conversationId);
      throw new BadRequestException('La conversación ha expirado');
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: dto.content,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    // Emitir evento WebSocket a ambos usuarios en la sala
    this.gateway.server
      .to(`conversation:${conversationId}`)
      .emit('new-message', message);

    // Notificar al receptor solo si no está activo en la sala de conversación
    const recipientId =
      senderId === conversation.userId
        ? conversation.charterId
        : conversation.userId;

    const roomSockets = await this.gateway.server
      .in(`conversation:${conversationId}`)
      .fetchSockets();
    const recipientInRoom = roomSockets.some(
      (s) => (s.data as { userId?: string }).userId === recipientId,
    );

    if (!recipientInRoom) {
      const senderName =
        senderId === conversation.userId
          ? conversation.user.name
          : conversation.charter.name;
      const matchId = conversation.travelMatch?.id;
      const recipientIsClient = recipientId === conversation.userId;
      const actionUrl = matchId
        ? recipientIsClient
          ? `/client/trips/matching/${matchId}`
          : `/driver/trips/matching/${matchId}`
        : recipientIsClient
          ? '/client/dashboard'
          : '/driver/dashboard';
      try {
        await this.notificationsService.createOrUpdate({
          userId: recipientId,
          type: 'new_message',
          title: `Mensaje de ${senderName}`,
          body: dto.content.length > 60 ? `${dto.content.slice(0, 60)}…` : dto.content,
          priority: NotificationPriority.HIGH,
          data: { actionUrl, conversationId, matchId },
          dedupeKey: `new_message:conversation:${conversationId}`,
        });
      } catch (err) {
        this.logger.error(`Notificación new_message fallida (no crítico): ${err}`);
      }
    }

    return {
      success: true,
      data: message,
    };
  }

  /**
   * Get conversation messages
   */
  async getMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    // Verify user is part of conversation
    if (conversation.userId !== userId && conversation.charterId !== userId) {
      throw new ForbiddenException('No eres parte de esta conversación');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mark messages as read for the requesting user
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    return {
      success: true,
      data: messages,
    };
  }

  /**
   * Get user's active conversations
   */
  async getUserConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ userId }, { charterId: userId }],
        status: 'active',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        charter: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                isRead: false,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      success: true,
      data: conversations.map((conv) => ({
        ...conv,
        unreadCount: conv._count.messages,
        lastMessage: conv.messages[0] || null,
      })),
    };
  }

  /**
   * Close a conversation
   */
  async closeConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }

    // Verify user is part of conversation
    if (conversation.userId !== userId && conversation.charterId !== userId) {
      throw new ForbiddenException('No eres parte de esta conversación');
    }

    if (conversation.status === 'closed') {
      throw new BadRequestException('La conversación ya está cerrada');
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'closed',
        closedBy: userId,
        closedAt: nowInBuenosAires().toJSDate(),
      },
    });

    this.logger.log(
      `Conversación ${conversationId} cerrada por usuario ${userId}`,
    );

    return {
      success: true,
      message: 'Conversación cerrada',
      data: updated,
    };
  }

  /**
   * Expire a conversation (internal use)
   */
  private async expireConversation(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'expired',
        closedAt: nowInBuenosAires().toJSDate(),
      },
    });

    this.logger.log(`Conversación ${conversationId} expirada automáticamente`);
  }

  /**
   * Clean up expired conversations (runs every hour)
   * Deletes conversations that expired and are not archived
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredConversations() {
    const now = nowInBuenosAires().toJSDate();

    // Find expired conversations that are not archived
    const expired = await this.prisma.conversation.findMany({
      where: {
        expiresAt: { lt: now },
        status: 'active',
        isArchived: false,
      },
    });

    if (expired.length === 0) {
      return;
    }

    this.logger.log(`Encontradas ${expired.length} conversaciones expiradas`);

    // Mark as expired
    for (const conv of expired) {
      await this.expireConversation(conv.id);
    }

    // Delete expired conversations (will cascade delete messages)
    const deleted = await this.prisma.conversation.deleteMany({
      where: {
        expiresAt: { lt: now },
        status: 'expired',
        isArchived: false,
      },
    });

    this.logger.log(`Eliminadas ${deleted.count} conversaciones expiradas`);
  }

  /**
   * Archive conversation (prevents auto-deletion)
   */
  async archiveConversation(conversationId: string) {
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isArchived: true },
    });

    this.logger.log(`Conversación ${conversationId} archivada`);
    return updated;
  }
}
