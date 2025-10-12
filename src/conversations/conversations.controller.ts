import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { SendMessageDto } from './dto';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Conversaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('match/:matchId')
  @Auditory('Conversation')
  @ApiOperation({ summary: 'Abrir canal de comunicación para un match aceptado' })
  @ApiResponse({ status: 201, description: 'Conversación creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Match no aceptado o sin chófer' })
  async createConversation(@Param('matchId') matchId: string) {
    return this.conversationsService.createConversation(matchId);
  }

  @Get('my-conversations')
  @ApiOperation({ summary: 'Obtener mis conversaciones activas' })
  @ApiResponse({ status: 200, description: 'Conversaciones obtenidas exitosamente' })
  async getMyConversations(@Request() req: any) {
    return this.conversationsService.getUserConversations(req.user.id);
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'Obtener mensajes de una conversación' })
  @ApiResponse({ status: 200, description: 'Mensajes obtenidos exitosamente' })
  @ApiResponse({ status: 403, description: 'No eres parte de esta conversación' })
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Request() req: any
  ) {
    return this.conversationsService.getMessages(conversationId, req.user.id);
  }

  @Post(':conversationId/messages')
  @Auditory('Message')
  @ApiOperation({ summary: 'Enviar un mensaje' })
  @ApiResponse({ status: 201, description: 'Mensaje enviado exitosamente' })
  @ApiResponse({ status: 400, description: 'Conversación cerrada o expirada' })
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Request() req: any,
    @Body() dto: SendMessageDto
  ) {
    return this.conversationsService.sendMessage(conversationId, req.user.id, dto);
  }

  @Put(':conversationId/close')
  @Auditory('Conversation')
  @ApiOperation({ summary: 'Cerrar una conversación' })
  @ApiResponse({ status: 200, description: 'Conversación cerrada exitosamente' })
  @ApiResponse({ status: 403, description: 'No eres parte de esta conversación' })
  async closeConversation(
    @Param('conversationId') conversationId: string,
    @Request() req: any
  ) {
    return this.conversationsService.closeConversation(conversationId, req.user.id);
  }
}

