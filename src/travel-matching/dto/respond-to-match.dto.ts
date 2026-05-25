import { IsBoolean, IsOptional, IsString, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RespondToMatchDto {
  @IsBoolean()
  accept: boolean;

  @ApiPropertyOptional({ description: 'Conductor extra asignado (null = maneja el titular)' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Ayudantes asignados', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  helperIds?: string[];
}
