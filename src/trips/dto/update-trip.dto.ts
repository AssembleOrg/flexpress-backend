import { IsString, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  workersCount?: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
} 