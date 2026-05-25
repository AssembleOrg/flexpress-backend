import { IsString, IsEnum, IsOptional, MaxLength, IsInt, Min } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'Créditos a devolver al reportador',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditsToReporter?: number;

  @ApiPropertyOptional({
    description: 'Créditos a quitar al reportado',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditsFromReported?: number;

  @ApiPropertyOptional({
    description: 'A favor de quién se resuelve (informativo)',
    enum: ['reporter', 'reported', 'company'],
  })
  @IsOptional()
  @IsEnum(['reporter', 'reported', 'company'])
  resolvedInFavorOf?: 'reporter' | 'reported' | 'company';
}

