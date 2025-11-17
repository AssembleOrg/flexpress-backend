import { BaseEntityDto } from '../../common/dto/base.dto';

export enum TripStatus {
  PENDING = 'pending',
  CHARTER_COMPLETED = 'charter_completed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class TripResponseDto extends BaseEntityDto {
  userId: string;
  charterId: string;
  address: string;
  latitude: string;
  longitude: string;
  status: TripStatus;
  workersCount?: number;
  scheduledDate?: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  charter?: {
    id: string;
    name: string;
    email: string;
  };
} 