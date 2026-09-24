import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Token recibido en el link del mail de confirmación',
  })
  @IsString()
  @Length(20, 200)
  token: string;
}
