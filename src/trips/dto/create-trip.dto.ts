import { IsString, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';

export class CreateTripDto {
  @IsString()
  userId: string;

  @IsString()
  charterId: string;

  @IsString()
  address: string; // Dirección completa (ej: "Av. Hipólito Yrigoyen 8985, Temperley, Buenos Aires")

  @IsString()
  latitude: string;

  @IsString()
  longitude: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  workersCount?: number;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;
} 