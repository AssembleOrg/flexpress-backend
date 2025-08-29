import { IsString, IsOptional } from 'class-validator';

export class CreateSystemConfigDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  description?: string;
} 