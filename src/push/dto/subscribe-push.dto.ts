import { IsString, IsUrl } from 'class-validator';

export class SubscribePushDto {
  @IsUrl()
  endpoint: string;

  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}
