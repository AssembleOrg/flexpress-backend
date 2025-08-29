import { BaseEntityDto } from '../../common/dto/base.dto';

export class SystemConfigResponseDto extends BaseEntityDto {
  key: string;
  value: string;
  description?: string;
} 