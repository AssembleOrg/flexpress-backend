import { IsEmail, IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { UserRole } from '../../common/enums';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  password: string;

  @IsEnum(UserRole)
  role: UserRole = UserRole.USER;

  @IsString()
  address: string;

  @IsNumber()
  @Min(0)
  @Transform(() => 0)
  credits: number = 0;

  @IsOptional()
  @IsString()
  documentationFrontUrl?: string;

  @IsOptional()
  @IsString()
  documentationBackUrl?: string;

  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  avatar?: string;
} 