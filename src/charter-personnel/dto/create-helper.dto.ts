import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHelperDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Gómez' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'https://spaces.../selfie.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
