import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token entregado en el login o en el canje anterior' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token de la sesión a cerrar' })
  @IsOptional()
  @IsString()
  refresh_token?: string;

  @ApiPropertyOptional({ description: 'Endpoint push de este dispositivo, para dejar de recibir notificaciones' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  push_endpoint?: string;
}
