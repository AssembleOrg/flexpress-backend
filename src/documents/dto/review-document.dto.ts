import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DocumentReviewStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: DocumentReviewStatus })
  @IsEnum(DocumentReviewStatus)
  status: DocumentReviewStatus;

  @ApiPropertyOptional({ example: 'Imagen ilegible' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
