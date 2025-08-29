import { IsString } from 'class-validator';

export class CreateTripDto {
  @IsString()
  userId: string;

  @IsString()
  charterId: string;

  @IsString()
  tripTo: string;

  @IsString()
  latitude: string;

  @IsString()
  longitude: string;
} 