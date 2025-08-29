import { IsString, IsOptional } from 'class-validator';

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  tripTo?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;
} 