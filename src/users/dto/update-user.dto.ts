import { IsEmail, IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { UserRole, VerificationStatus } from '../../common/enums';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credits?: number;

  @IsOptional()
  @IsString()
  documentationFrontUrl?: string;

  @IsOptional()
  @IsString()
  documentationBackUrl?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  originAddress?: string;

  @IsOptional()
  @IsString()
  originLatitude?: string;

  @IsOptional()
  @IsString()
  originLongitude?: string;

  // Charter verification fields
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
} 