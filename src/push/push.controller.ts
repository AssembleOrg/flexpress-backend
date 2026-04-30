import { Controller, Post, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@ApiTags('Push')
@Controller('push')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Registrar suscripción push para este dispositivo' })
  async subscribe(@Request() req: any, @Body() dto: SubscribePushDto) {
    await this.pushService.subscribe(req.user.id, dto);
    return { success: true };
  }

  @Delete('unsubscribe')
  @ApiOperation({ summary: 'Eliminar suscripción push de este dispositivo' })
  async unsubscribe(@Request() req: any, @Body() body: { endpoint: string }) {
    await this.pushService.unsubscribe(req.user.id, body.endpoint);
    return { success: true };
  }
}
