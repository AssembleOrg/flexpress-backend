import { UpdateReportDto } from './dto';

/**
 * Build the in-app/push notification body shown to each party when a report is resolved.
 */
export function buildResolutionBody(
  forUser: 'reporter' | 'reported',
  dto: UpdateReportDto,
): string {
  const parts: string[] = [];

  if (dto.status === 'dismissed') {
    parts.push('Tu reporte fue desestimado.');
  } else {
    parts.push('Tu reporte fue resuelto.');
  }

  if (forUser === 'reporter' && dto.creditsToReporter && dto.creditsToReporter > 0) {
    parts.push(`Se te devolvieron ${dto.creditsToReporter} créditos.`);
  }

  if (forUser === 'reported' && dto.creditsFromReported && dto.creditsFromReported > 0) {
    parts.push(`Se te descontaron ${dto.creditsFromReported} créditos.`);
  }

  if (dto.adminNotes) {
    parts.push(`Notas: ${dto.adminNotes}`);
  }

  return parts.join(' ');
}
