/**
 * Costo en créditos que paga el charter por aceptar un viaje, escalonado por
 * distancia. Un viaje más largo le rinde más al charter, así que también cuesta
 * más créditos aceptarlo.
 *
 *   0 – 30 km  → 2 créditos
 *   31 – 60 km → 3 créditos
 *   más de 60  → 4 créditos
 *
 * El costo del cliente NO se calcula acá: el cliente siempre paga 1 crédito.
 *
 * FUENTE DE VERDAD del cobro. El frontend replica esta tabla en
 * `lib/utils/creditCost.ts` sólo para UI/optimismo; el descuento real usa ESTA.
 *
 * @param distanceKm Distancia del viaje en km (o null si no se conoce).
 * @returns Créditos a descontar al charter. Fallback = 2 (costo mínimo) cuando
 *   la distancia no está disponible, para no romper el comportamiento previo.
 */
export function getCharterCreditCost(distanceKm: number | null): number {
  if (distanceKm == null || distanceKm <= 30) return 2;
  if (distanceKm <= 60) return 3;
  return 4;
}
