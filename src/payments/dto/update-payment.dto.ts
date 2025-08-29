import { IsOptional, IsEnum } from 'class-validator';
import { PaymentStatus } from '../../common/enums';

export class UpdatePaymentDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
} 