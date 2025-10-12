import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleAvailabilityDto {
  @ApiProperty({ description: 'Charter availability status' })
  @IsBoolean()
  isAvailable: boolean;
}

