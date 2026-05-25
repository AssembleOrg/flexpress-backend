import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReviewStatus {
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum DocReviewStatus {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class ReviewEntityDto {
  @ApiProperty({ enum: ReviewStatus, example: 'verified' })
  @IsEnum(ReviewStatus)
  status: ReviewStatus;

  @ApiPropertyOptional({ example: 'Foto borrosa' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: DocReviewStatus, example: 'approved' })
  @IsEnum(DocReviewStatus)
  status: DocReviewStatus;

  @ApiPropertyOptional({ example: 'No se ve el dorso' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
