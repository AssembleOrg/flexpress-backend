import { IsString, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleSize } from '@prisma/client';

export class CreateVehicleDto {
  @ApiProperty({ example: 'ABC123' })
  @IsString()
  plate: string;

  @ApiPropertyOptional({ example: 'Ford' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'Transit' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ example: 'Fiorino roja' })
  @IsOptional()
  @IsString()
  alias?: string;

  @ApiPropertyOptional({ enum: VehicleSize, example: 'chico' })
  @IsOptional()
  @IsEnum(VehicleSize)
  size?: VehicleSize;
}
