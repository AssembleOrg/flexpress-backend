import { IsEnum } from 'class-validator';
import { InquiryResponseCode } from '@prisma/client';

export class RespondInquiryDto {
  @IsEnum(InquiryResponseCode)
  responseCode: InquiryResponseCode;
}
