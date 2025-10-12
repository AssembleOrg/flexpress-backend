import { IsString, IsInt, Min, Max, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty({ 
    description: 'ID del viaje',
    example: 'trip123'
  })
  @IsString()
  tripId: string;

  @ApiProperty({ 
    description: 'ID del usuario que recibe el feedback (charter o usuario)',
    example: 'user456'
  })
  @IsString()
  toUserId: string;

  @ApiProperty({ 
    description: 'Calificación de 1 a 5 estrellas',
    example: 5,
    minimum: 1,
    maximum: 5
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ 
    description: 'Comentario opcional sobre el viaje',
    example: 'Excelente servicio, muy puntual y amable'
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

