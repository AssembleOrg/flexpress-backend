import { BaseEntityDto } from '../../common/dto/base.dto';
import { UserRole } from '../../common/enums';

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
} 