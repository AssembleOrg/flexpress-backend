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

  @ApiProperty({ example: 'dev/private/vehiculo-doc/clx123/9f2c.jpg' })
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional({ example: '2025-12-31T00:00:00Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
