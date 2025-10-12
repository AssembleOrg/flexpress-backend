import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateReportDto {
  @ApiPropertyOptional({ 
    description: 'Nuevo estado del reporte',
    enum: ['pending', 'investigating', 'resolved', 'dismissed']
  })
  @IsOptional()
  @IsEnum(['pending', 'investigating', 'resolved', 'dismissed'])
  status?: string;

  @ApiPropertyOptional({ 
    description: 'Notas del administrador',
    example: 'Reporte revisado y confirmado. Usuario sancionado.'
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

