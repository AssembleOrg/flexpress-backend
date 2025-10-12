import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto';
import { Auditory } from '../common/decorators/auditory.decorator';

@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @Auditory('Feedback')
  @ApiOperation({ summary: 'Crear feedback para un viaje' })
  @ApiResponse({ status: 201, description: 'Feedback creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Solicitud inválida' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado' })
  async createFeedback(@Request() req: any, @Body() dto: CreateFeedbackDto) {
    return this.feedbackService.createFeedback(req.user.id, dto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener todos los feedbacks de un usuario' })
  @ApiResponse({ status: 200, description: 'Feedbacks obtenidos exitosamente' })
  async getUserFeedbacks(@Param('userId') userId: string) {
    return this.feedbackService.getUserFeedbacks(userId);
  }

  @Get('trip/:tripId')
  @ApiOperation({ summary: 'Obtener feedbacks de un viaje específico' })
  @ApiResponse({ status: 200, description: 'Feedbacks obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado' })
  async getTripFeedbacks(@Param('tripId') tripId: string) {
    return this.feedbackService.getTripFeedbacks(tripId);
  }

  @Get('my-feedbacks')
  @ApiOperation({ summary: 'Obtener feedbacks que he dado' })
  @ApiResponse({ status: 200, description: 'Feedbacks obtenidos exitosamente' })
  async getMyFeedbacks(@Request() req: any) {
    return this.feedbackService.getFeedbacksGiven(req.user.id);
  }

  @Get('can-give/:tripId')
  @ApiOperation({ summary: 'Verificar si puedo dar feedback para un viaje' })
  @ApiResponse({ status: 200, description: 'Verificación exitosa' })
  async canGiveFeedback(@Request() req: any, @Param('tripId') tripId: string) {
    return this.feedbackService.canGiveFeedback(req.user.id, tripId);
  }
}

