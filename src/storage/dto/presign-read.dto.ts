import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignReadDto {
  @ApiProperty({ example: 'dev/private/dni/clx123/9f2c.jpg' })
  @IsString()
  key: string;
}
