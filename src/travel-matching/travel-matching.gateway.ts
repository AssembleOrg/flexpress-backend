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
import { PrismaService } from '../prisma/prisma.service';

/**
 * Datos que el gateway cuelga de cada socket autenticado. Vivir en
 * `socket.data` (y no en un Map propio) hace que mueran con el socket: no hay
 * nada que limpiar en disconnect y nada que pueda quedar colgado.
 */
interface SocketData {
  userId?: string;
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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
      (client.data as SocketData).userId = userId;

      // Room personal — Socket.IO la mantiene y la desarma sola al desconectar,
      // así que sirve de índice userId -> sockets sin estado propio.
      client.join(`user:${userId}`);
      this.logger.log(`Socket ${client.id} conectado → usuario ${userId}`);
    } catch {
      this.logger.warn(`Socket ${client.id} token inválido — desconectando`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket ${client.id} desconectado`);
  }

  /**
   * La identidad sale siempre del JWT verificado en la conexión. El payload de
   * los eventos puede traer un `userId`, pero se ignora: un cliente podría
   * mandar cualquiera.
   */
  private userIdOf(client: Socket): string | undefined {
    return (client.data as SocketData).userId;
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    const userId = this.userIdOf(client);
    if (!userId || !conversationId) {
      return { success: false, message: 'No autorizado' };
    }

    // Solo las dos partes de la conversación pueden escuchar su room.
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userId: true, charterId: true },
    });
    if (
      !conversation ||
      (conversation.userId !== userId && conversation.charterId !== userId)
    ) {
      this.logger.warn(
        `Usuario ${userId} intentó entrar a conversación ${conversationId} sin pertenecer`,
      );
      return { success: false, message: 'No autorizado' };
    }

    client.join(`conversation:${conversationId}`);
    this.logger.log(`Usuario ${userId} entró a conversación ${conversationId}`);

    client.to(`conversation:${conversationId}`).emit('user-joined', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Unido a conversación' };
  }

  @SubscribeMessage('leave-conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    const userId = this.userIdOf(client);

    client.leave(`conversation:${conversationId}`);
    this.logger.log(
      `Usuario ${userId} salió de conversación ${conversationId}`,
    );

    client.to(`conversation:${conversationId}`).emit('user-left', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, message: 'Salió de conversación' };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping?: boolean },
  ) {
    const { conversationId, isTyping = true } = data;

    // Solo quien está en el room puede avisar que escribe en él.
    if (!client.rooms.has(`conversation:${conversationId}`)) {
      return { success: false };
    }

    client.to(`conversation:${conversationId}`).emit('user-typing', {
      userId: this.userIdOf(client),
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
    this.notifyUser(userId, 'new-conversation', {
      conversation: conversationData,
      timestamp: new Date().toISOString(),
    });
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
    this.logger.log(
      `Notificando a usuario ${userId} sobre actualización de match ${matchData.matchId} a estado ${matchData.status}`,
    );
    this.notifyUser(userId, 'match:updated', matchData);
  }
}
