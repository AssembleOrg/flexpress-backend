import {
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';

interface ConversationRoom {
  conversationId: string;
  userId: string;
  charterId: string;
  sockets: Set<string>; // socket IDs in this room
}

@Injectable()
@WebSocketGateway({
  namespace: '/conversations',
})
export class TravelMatchingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TravelMatchingGateway.name);
  private rooms: Map<string, ConversationRoom> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`Socket ${client.id} sin token — desconectando`);
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      const userId = payload.sub;
      (client as any).userId = userId;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Room personal — permite emitir a un usuario sin iterar el Map
      client.join(`user:${userId}`);
      this.logger.log(`Socket ${client.id} conectado → usuario ${userId}`);
    } catch {
      this.logger.warn(`Socket ${client.id} token inválido — desconectando`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId as string | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
      }
    }
    // Limpiar rooms de conversación
    this.rooms.forEach((room, conversationId) => {
      room.sockets.delete(client.id);
      if (room.sockets.size === 0) {
        this.rooms.delete(conversationId);
      }
    });
    this.logger.log(`Socket ${client.id} desconectado`);
  }

  @SubscribeMessage('join-conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; userId: string; charterId?: string },
  ) {
    const { conversationId, userId, charterId } = data;

    // Store user socket mapping (support multiple sockets per user)
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    // Join the conversation room
    client.join(`conversation:${conversationId}`);

    // Track room
    if (!this.rooms.has(conversationId)) {
      this.rooms.set(conversationId, {
        conversationId,
        userId,
        charterId: charterId || '',
        sockets: new Set([client.id]),
      });
    } else {
      const room = this.rooms.get(conversationId)!;
      room.sockets.add(client.id);
    }

    this.logger.log(`Usuario ${userId} entró a conversación ${conversationId}`);

    // Notify others in the room
    client.to(`conversation:${conversationId}`).emit('user-joined', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Unido a conversación' };
  }

  @SubscribeMessage('leave-conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    const { conversationId, userId } = data;

    client.leave(`conversation:${conversationId}`);

    const room = this.rooms.get(conversationId);
    if (room) {
      room.sockets.delete(client.id);
      if (room.sockets.size === 0) {
        this.rooms.delete(conversationId);
      }
    }

    // Remove from user sockets
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(client.id);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    this.logger.log(
      `Usuario ${userId} salió de conversación ${conversationId}`,
    );

    // Notify others
    client.to(`conversation:${conversationId}`).emit('user-left', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Salió de conversación' };
  }

  @SubscribeMessage('send-message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      userId: string;
      message: string;
      userName: string;
    },
  ) {
    const { conversationId, userId, message, userName } = data;

    this.logger.log(`Mensaje en conversación ${conversationId} de ${userId}`);

    // Broadcast to everyone in the room including sender
    this.server.to(`conversation:${conversationId}`).emit('new-message', {
      conversationId,
      userId,
      userName,
      message,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Mensaje enviado' };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      userId: string;
      userName: string;
      isTyping: boolean;
    },
  ) {
    const { conversationId, userId, userName, isTyping } = data;

    // Notify others (not the sender)
    client.to(`conversation:${conversationId}`).emit('user-typing', {
      userId,
      userName,
      isTyping,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Notify conversation closed
   */
  notifyConversationClosed(conversationId: string, closedBy: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('conversation-closed', {
        conversationId,
        closedBy,
        timestamp: new Date().toISOString(),
      });
  }

  /**
   * Notify user about new conversation
   */
  notifyNewConversation(userId: string, conversationData: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('new-conversation', {
          conversation: conversationData,
          timestamp: new Date().toISOString(),
        });
      });
    }
  }

  /**
   * Notify users about conversation expiration
   */
  notifyConversationExpired(conversationId: string) {
    this.server
      .to(`conversation:${conversationId}`)
      .emit('conversation-expired', {
        conversationId,
        message: 'La conversación ha expirado después de 5 horas',
        timestamp: new Date().toISOString(),
      });
  }
  /**
   * Emite un evento a todos los sockets de un usuario.
   * Usa el room personal `user:{userId}` creado en handleConnection.
   * Prerequisito para el sistema de notificaciones.
   */
  notifyUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  public notifyMatchUpdate(
    userId: string,
    matchData: { matchId: string; status: string },
  ) {
    const userSocketIds = this.userSockets.get(userId);

    if (userSocketIds && userSocketIds.size > 0) {
      userSocketIds.forEach((socketId) => {
        this.server.to(socketId).emit('match:updated', matchData);
        this.logger.log(
          `Notificando a usuario ${userId} (socket ${socketId}) sobre actualización de match ${matchData.matchId} a estado ${matchData.status}`,
        );
      });
    } else {
      this.logger.warn(
        `No se encontró socket activo para el usuario ${userId} para notificar sobre el match ${matchData.matchId}`,
      );
    }
  }
}
