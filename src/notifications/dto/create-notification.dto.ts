import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationPriority } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ example: 'cmgne6tht000cgxe1mzpiou4s' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'match_accepted' })
  @IsString()
  type: string;

  @ApiProperty({ example: 'Tu viaje fue aceptado' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Carlos aceptó tu solicitud de viaje.' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ enum: NotificationPriority, default: NotificationPriority.LOW })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({
    example: { actionUrl: '/client/dashboard', matchId: 'abc123' },
    description: 'actionUrl must be a relative internal path (e.g. /client/dashboard)',
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'new_message:conversation:abc123',
    description: 'Composite key for deduplication. If present and an unread notification with the same key exists, it will be updated instead of created.',
  })
  @IsOptional()
  @IsString()
  dedupeKey?: string;
}
