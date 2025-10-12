import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCharterOriginDto {
  @ApiPropertyOptional({ description: 'Charter origin address', example: 'St Martin 425, Buenos Aires' })
  @IsOptional()
  @IsString()
  originAddress?: string;

  @ApiPropertyOptional({ description: 'Charter origin latitude', example: '-34.850' })
  @IsOptional()
  @IsString()
  originLatitude?: string;

  @ApiPropertyOptional({ description: 'Charter origin longitude', example: '-58.349' })
  @IsOptional()
  @IsString()
  originLongitude?: string;
}

