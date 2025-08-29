import { BaseEntityDto } from '../../common/dto/base.dto';
import { PaymentStatus } from '../../common/enums';

export class PaymentResponseDto extends BaseEntityDto {
  userId: string;
  credits: number;
  amount: number;
  status: PaymentStatus;
  user?: {
    id: string;
    name: string;
    email: string;
  };
} 