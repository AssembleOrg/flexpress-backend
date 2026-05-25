import { InquiryResponseCode } from '@prisma/client';

// SYNC: mantener idéntico al frontend (lib/constants/availabilityInquiry.ts).
// Si cambia un label acá, actualizar el archivo del frontend en el mismo commit.
export const INQUIRY_RESPONSE_LABELS: Record<InquiryResponseCode, string> = {
  available_soon: 'Estoy disponible en ~2 horas',
  available_today_later: 'Disponible más tarde hoy, te aviso',
  available_tomorrow: 'Disponible mañana',
  not_today: 'Hoy no puedo, otro día sí',
  not_available: 'No estoy disponible para este viaje',
};
