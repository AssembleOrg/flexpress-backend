import { BaseEntityDto } from '../../common/dto/base.dto';
import { UserRole } from '../../common/enums';
import { VerificationStatus } from '@prisma/client';

export class UserResponseDto extends BaseEntityDto {
  email: string;
  name: string;
  role: UserRole;
  address: string;
  credits: number;
  documentationFrontUrl?: string;
  documentationBackUrl?: string;
  number: string;
  avatar?: string;

  // Charter-specific fields
  originAddress?: string;
  originLatitude?: string;
  originLongitude?: string;

  // Verification fields
  verificationStatus?: VerificationStatus;
  rejectionReason?: string;
  verifiedAt?: Date;
  verifiedBy?: string;
} 