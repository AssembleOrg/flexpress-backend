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

// Debe coincidir con CANONICAL_AR_PHONE_REGEX del frontend (lib/utils/phone.ts).
const AR_PHONE_REGEX = /^\+54 9 \d{2} \d{4}-\d{4}$/;

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
