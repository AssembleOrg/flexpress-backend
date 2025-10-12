import { IsString, IsNumber, IsOptional, Min, Max, IsDateString, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMatchDto {
  @ApiProperty({ description: 'Dirección de recogida completa', example: 'Av. Hipólito Yrigoyen 8985, Temperley, Buenos Aires' })
  @IsString()
  pickupAddress: string;

  @ApiProperty({ description: 'Latitud del punto de recogida', example: '-34.7700' })
  @IsString()
  pickupLatitude: string;

  @ApiProperty({ description: 'Longitud del punto de recogida', example: '-58.3936' })
  @IsString()
  pickupLongitude: string;

  @ApiProperty({ description: 'Dirección de destino completa', example: 'Calle 13 567, La Plata, Buenos Aires' })
  @IsString()
  destinationAddress: string;

  @ApiProperty({ description: 'Latitud de destino', example: '-34.9205' })
  @IsString()
  destinationLatitude: string;

  @ApiProperty({ description: 'Longitud de destino', example: '-57.9536' })
  @IsString()
  destinationLongitude: string;

  @ApiPropertyOptional({ 
    description: 'Radio máximo de búsqueda en kilómetros', 
    example: 30,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxRadiusKm?: number;

  @ApiPropertyOptional({ 
    description: 'Número de trabajadores para ayudar con la carga/descarga', 
    example: 2,
    minimum: 0,
    maximum: 10
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  workersCount?: number;

  @ApiPropertyOptional({ 
    description: 'Fecha programada para el viaje (ISO 8601)', 
    example: '2025-10-15T10:00:00-03:00'
  })
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
}

