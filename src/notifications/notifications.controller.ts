import { Controller, Get, Patch, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  @ApiOperation({ summary: 'Get my notifications (paginated by cursor)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'onlyUnread', required: false, type: Boolean, example: false })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    schema: {
      example: {
        notifications: [
          {
            id: 'clx123',
            userId: 'clx456',
            type: 'match_accepted',
            title: 'Tu viaje fue aceptado',
            body: 'Carlos aceptó tu solicitud.',
            priority: 'HIGH',
            isRead: false,
            readAt: null,
            data: { actionUrl: '/client/dashboard', matchId: 'clx789' },
            dedupeKey: null,
            createdAt: '2026-04-14T14:22:45.000Z',
            updatedAt: '2026-04-14T14:22:45.000Z',
          },
        ],
        nextCursor: null,
      },
    },
  })
  async getMyNotifications(
    @Request() req: any,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findManyByUser(req.user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unread notifications count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count',
    schema: { example: { count: 3 } },
  })
  async getUnreadCount(@Request() req: any) {
    return this.notificationsService.countUnread(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@Request() req: any) {
    await this.notificationsService.markAllAsRead(req.user.id);
  }
}
