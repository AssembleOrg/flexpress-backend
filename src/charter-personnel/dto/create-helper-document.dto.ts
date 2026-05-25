import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocSide } from './create-driver-document.dto';

export enum CharterHelperDocType {
  DNI = 'dni',
}

export class CreateHelperDocumentDto {
  @ApiProperty({ enum: CharterHelperDocType, example: 'dni' })
  @IsEnum(CharterHelperDocType)
  type: CharterHelperDocType;

  @ApiProperty({ enum: DocSide, example: 'front' })
  @IsEnum(DocSide)
  side: DocSide;

  @ApiProperty({ example: 'https://spaces.../dni-front.jpg' })
  @IsString()
  fileUrl: string;
}
