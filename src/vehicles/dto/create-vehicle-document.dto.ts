import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum VehicleDocumentType {
  FOTO = 'foto',
  CEDULA = 'cedula',
  SEGURO = 'seguro',
  VTV = 'vtv',
}

export class CreateVehicleDocumentDto {
  @ApiProperty({ enum: VehicleDocumentType, example: 'cedula' })
  @IsEnum(VehicleDocumentType)
  type: VehicleDocumentType;

  @ApiProperty({ example: 'https://uploadthing.com/...' })
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional({ example: '2025-12-31T00:00:00Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
