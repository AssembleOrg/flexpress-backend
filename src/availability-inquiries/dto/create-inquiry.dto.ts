import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInquiryDto {
  @IsString()
  @IsNotEmpty()
  charterId: string;
}
