import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole, VerificationStatus } from '../../common/enums';

// Acepta formato canónico móvil (+54 9 11 1234-5678) y fijo (+54 11 1234-5678).
const AR_PHONE_REGEX = /^\+54( 9)? \d{2,4} \d{3,4}-\d{4}$/;

export class UpdateUserDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
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
  @Matches(AR_PHONE_REGEX, { message: 'Teléfono argentino inválido' })
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

  // Precio por km del charter
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKm?: number;
}
