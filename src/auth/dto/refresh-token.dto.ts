import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token entregado en el login o en el canje anterior' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
