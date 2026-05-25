import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CharterDriverDocType {
  DNI = 'dni',
  LICENSE = 'license',
}

export enum DocSide {
  FRONT = 'front',
  BACK = 'back',
}

export class CreateDriverDocumentDto {
  @ApiProperty({ enum: CharterDriverDocType, example: 'dni' })
  @IsEnum(CharterDriverDocType)
  type: CharterDriverDocType;

  @ApiPropertyOptional({ enum: DocSide, example: 'front', description: 'Solo requerido para DNI' })
  @IsOptional()
  @IsEnum(DocSide)
  side?: DocSide;

  @ApiProperty({ example: 'https://spaces.../dni-front.jpg' })
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional({ example: '2027-05-23T00:00:00Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
