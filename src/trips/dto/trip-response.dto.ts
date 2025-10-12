import { BaseEntityDto } from '../../common/dto/base.dto';

export class TripResponseDto extends BaseEntityDto {
  userId: string;
  charterId: string;
  address: string;
  latitude: string;
  longitude: string;
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