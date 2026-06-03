import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAccountStatusDto {
  @ApiProperty({
    enum: ['active', 'warned', 'banned'],
    description:
      'Estado de la cuenta. La cuenta (titular) es la unidad punible: un error de un conductor recae sobre el titular.',
    example: 'warned',
  })
  @IsEnum(['active', 'warned', 'banned'])
  status: 'active' | 'warned' | 'banned';

  @ApiPropertyOptional({
    description:
      'Motivo de la advertencia/bloqueo, visible para el charter. Requerido para warned/banned.',
    example: 'Reportes reiterados de demoras en la entrega',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
