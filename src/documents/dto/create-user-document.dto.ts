import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserDocumentType {
  DNI = 'dni',
}

export enum DocumentSide {
  FRONT = 'front',
  BACK = 'back',
}

export class CreateUserDocumentDto {
  @ApiProperty({ enum: UserDocumentType, example: 'dni' })
  @IsEnum(UserDocumentType)
  type: UserDocumentType;

  @ApiPropertyOptional({ enum: DocumentSide, example: 'front' })
  @IsOptional()
  @IsEnum(DocumentSide)
  side?: DocumentSide;

  @ApiProperty({ example: 'dev/private/dni/clx123/9f2c.jpg' })
  @IsString()
  fileUrl: string;
}
