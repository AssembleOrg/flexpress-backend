import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';
import { UserRole } from '../../common/enums';
import { Transform } from 'class-transformer';

// Acepta formato canónico móvil (+54 9 11 1234-5678) y fijo (+54 11 1234-5678).
const AR_PHONE_REGEX = /^\+54( 9)? \d{2,4} \d{3,4}-\d{4}$/;

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
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
  @Matches(AR_PHONE_REGEX, { message: 'Teléfono argentino inválido' })
  number: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  // Charter-specific fields (origin location)
  @IsOptional()
  @IsString()
  originAddress?: string;

  @IsOptional()
  @IsString()
  originLatitude?: string;

  @IsOptional()
  @IsString()
  originLongitude?: string;

  // Precio por km del charter
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerKm?: number;
}
