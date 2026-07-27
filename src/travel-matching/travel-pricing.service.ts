import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Estimado del viaje en PESOS ARS (informativo). Estos defaults aplican si no
// hay config en SystemConfig. NO se mezclan con los créditos (matching).
export const DEFAULT_MIN_PRICE_ARS = 20000; // mínimo de todo viaje
export const DEFAULT_WAIT_BLOCK_MINUTES = 30; // duración del bloque de espera fija
export const RETURN_TRIP_FACTOR = 0.5; // la vuelta se cobra al 50% del $/km

export interface PricingConfig {
  baseRate: number;
  minimumCharge: number;
  workerRate: number;
}

export interface EstimatedPriceArs {
  total: number | null;
  ida: number | null;
  wait: number | null;
  return: number | null;
}

/**
 * Cálculo de precios y costos del matching.
 *
 * Separado de TravelMatchingService porque no toca el estado de ningún match:
 * lee configuración y hace aritmética. Eso lo vuelve testeable solo y evita que
 * el servicio de matching siga creciendo con lógica que no es suya.
 *
 * Ojo con las dos monedas, que son independientes:
 *  - créditos: comisión de matchmaking (calculateCost / credit-cost.util)
 *  - pesos ARS: estimado informativo que el cliente coordina con el charter
 */
@Injectable()
export class TravelPricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Load pricing configuration from database (call once, reuse)
   */
  async loadPricingConfig(): Promise<PricingConfig> {
    const configs = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          startsWith: 'pricing_',
        },
      },
    });

    // Default pricing
    let baseRate = 1; // credits per km
    let minimumCharge = 5; // minimum credits
    let workerRate = 50; // credits per worker

    for (const config of configs) {
      if (config.key === 'pricing_base_rate_per_km') {
        baseRate = parseFloat(config.value);
      } else if (config.key === 'pricing_minimum_charge') {
        minimumCharge = parseFloat(config.value);
      } else if (config.key === 'pricing_worker_rate') {
        workerRate = parseFloat(config.value);
      }
    }

    return { baseRate, minimumCharge, workerRate };
  }

  /**
   * Mínimo del estimado en PESOS ARS. Reusa la clave 'pricing_minimum_charge'
   * (cuyo significado pasó a ser pesos; ya no alimenta ningún cobro en créditos).
   */
  async loadMinPriceArs(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'pricing_minimum_charge' },
    });
    const value = config ? parseFloat(config.value) : NaN;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MIN_PRICE_ARS;
  }

  /**
   * Calculate cost based on distance, workers and pricing config
   * @param pricingConfig - Pre-loaded pricing config (optional, will load if not provided)
   */
  async calculateCost(
    distanceKm: number,
    workersCount: number = 0,
    pricingConfig?: PricingConfig,
  ): Promise<number> {
    // Use pre-loaded config or load it (for backwards compatibility)
    const config = pricingConfig || (await this.loadPricingConfig());

    // Calculate distance cost
    const distanceCost = Math.ceil(distanceKm * config.baseRate);

    // Calculate worker cost
    const workerCost = workersCount * config.workerRate;

    // Total cost
    const totalCost = distanceCost + workerCost;

    return Math.max(totalCost, config.minimumCharge);
  }

  /**
   * Estimado del viaje en PESOS ARS (informativo, aproximado por línea recta).
   * Independiente de los créditos (que son solo comisión de matchmaking).
   *
   *   ida    = (pickup→destino) × pricePerKm  ← SOLO el viaje del cliente; no se
   *            le cobra el traslado del charter hasta el pickup.
   *   espera = pricePerWaitBlock (1 bloque fijo por viaje; 0 si no cobra)
   *   vuelta = (destino→charter) × pricePerKm × 0.5  (solo si chargesReturnTrip)
   *   total  = max(ida, mínimo $20.000)
   *
   * El `total` que ve el cliente es SOLO la ida pickup→destino (aproximado por
   * km, coincide con la "distancia estimada" que se le muestra). Espera y vuelta
   * se siguen calculando y se devuelven aparte (wait/return) pero NO suman al
   * total mostrado: son posibles recargos que el cliente coordina con el
   * charter, no un desglose sumado.
   *
   * Devuelve null en todos los campos si el charter no configuró pricePerKm.
   */
  calculateEstimatedPriceArs(
    idaKm: number,
    returnKm: number,
    charter: {
      pricePerKm: number | null;
      pricePerWaitBlock: number | null;
      chargesReturnTrip: boolean;
    },
    minPriceArs: number,
  ): EstimatedPriceArs {
    // Sin tarifa por km configurada → no hay estimado (no se muestra).
    if (charter.pricePerKm == null || charter.pricePerKm <= 0) {
      return { total: null, ida: null, wait: null, return: null };
    }

    const pricePerKm = charter.pricePerKm;
    const ida = idaKm * pricePerKm;
    const wait = charter.pricePerWaitBlock ?? 0;
    const ret = charter.chargesReturnTrip
      ? returnKm * pricePerKm * RETURN_TRIP_FACTOR
      : 0;

    // El cliente solo ve el aproximado de la ida (con mínimo). Espera y vuelta
    // se devuelven aparte pero no suman al total mostrado.
    const total = Math.max(ida, minPriceArs);

    return {
      total: Math.round(total),
      ida: Math.round(ida),
      wait: Math.round(wait),
      return: Math.round(ret),
    };
  }
}
