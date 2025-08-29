import { BaseEntityDto } from '../../common/dto/base.dto';

export class TripResponseDto extends BaseEntityDto {
  userId: string;
  charterId: string;
  tripTo: string;
  latitude: string;
  longitude: string;
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