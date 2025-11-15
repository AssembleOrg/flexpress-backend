import { IsBoolean } from 'class-validator';

export class RespondToMatchDto {
  @IsBoolean()
  accept: boolean;
}
