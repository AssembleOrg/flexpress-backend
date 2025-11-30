import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { PaymentStatus } from '../../common/enums';

export class CreatePaymentDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(1)
  credits: number;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus = PaymentStatus.PENDING;
} 