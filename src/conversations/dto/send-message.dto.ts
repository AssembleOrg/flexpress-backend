import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ 
    description: 'Contenido del mensaje',
    example: 'Hola, confirmo que puedo estar a las 10:00 AM'
  })
  @IsString()
  @MaxLength(2000)
  content: string;
}

