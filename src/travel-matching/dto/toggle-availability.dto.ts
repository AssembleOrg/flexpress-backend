import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToggleAvailabilityDto {
  @ApiProperty({ description: 'Charter availability status' })
  @IsBoolean()
  isAvailable: boolean;

  @ApiProperty({ description: 'Active vehicle ID (optional)', required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({
    description:
      'Conductor extra activo (null/ausente = maneja el titular). Si se envía, vehicleId es obligatorio.',
  })
  @IsOptional()
  @IsString()
  activeDriverId?: string;

  @ApiPropertyOptional({ description: 'Ayudantes activos', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  activeHelperIds?: string[];
}

