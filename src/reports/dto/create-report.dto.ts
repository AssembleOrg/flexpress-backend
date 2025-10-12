import { IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ 
    description: 'ID de la conversación a reportar',
    example: 'conv123'
  })
  @IsString()
  conversationId: string;

  @ApiProperty({ 
    description: 'ID del usuario reportado',
    example: 'user456'
  })
  @IsString()
  reportedId: string;

  @ApiProperty({ 
    description: 'Motivo del reporte',
    example: 'Comportamiento inapropiado'
  })
  @IsString()
  @MaxLength(200)
  reason: string;

  @ApiPropertyOptional({ 
    description: 'Descripción detallada del problema',
    example: 'El usuario utilizó lenguaje ofensivo durante toda la conversación'
  })
  @IsString()
  @MaxLength(1000)
  description?: string;
}

