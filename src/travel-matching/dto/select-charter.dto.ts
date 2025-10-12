import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectCharterDto {
  @ApiProperty({ description: 'Charter user ID' })
  @IsString()
  charterId: string;
}

