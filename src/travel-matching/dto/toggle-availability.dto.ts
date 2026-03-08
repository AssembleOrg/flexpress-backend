import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleAvailabilityDto {
  @ApiProperty({ description: 'Charter availability status' })
  @IsBoolean()
  isAvailable: boolean;

  @ApiProperty({ description: 'Active vehicle ID (optional)', required: false })
  @IsOptional()
  @IsString()
  vehicleId?: string;
}

