import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyCharterDto {
  @ApiProperty({
    enum: ['verified', 'rejected'],
    description: 'New verification status for the charter',
    example: 'verified',
  })
  @IsEnum(['verified', 'rejected'])
  status: 'verified' | 'rejected';

  @ApiPropertyOptional({
    description: 'Reason for rejection (required if status is rejected)',
    example: 'Documentación incompleta o ilegible',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
