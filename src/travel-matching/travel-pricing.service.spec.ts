import {
  TravelPricingService,
  DEFAULT_MIN_PRICE_ARS,
  RETURN_TRIP_FACTOR,
} from './travel-pricing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TravelPricingService', () => {
  const build = (configs: Array<{ key: string; value: string }> = []) => {
    const prisma = {
      systemConfig: {
        findMany: jest.fn().mockResolvedValue(configs),
        findUnique: jest
          .fn()
          .mockResolvedValue(
            configs.find((c) => c.key === 'pricing_minimum_charge') ?? null,
          ),
      },
    } as unknown as PrismaService;

    return new TravelPricingService(prisma);
  };

  describe('loadPricingConfig', () => {
    it('usa los defaults cuando no hay nada en SystemConfig', async () => {
      await expect(build().loadPricingConfig()).resolves.toEqual({
        baseRate: 1,
        minimumCharge: 5,
        workerRate: 50,
      });
    });

    it('toma los valores de SystemConfig cuando existen', async () => {
      const service = build([
        { key: 'pricing_base_rate_per_km', value: '2.5' },
        { key: 'pricing_minimum_charge', value: '30000' },
        { key: 'pricing_worker_rate', value: '80' },
      ]);

      await expect(service.loadPricingConfig()).resolves.toEqual({
        baseRate: 2.5,
        minimumCharge: 30000,
        workerRate: 80,
      });
    });
  });

  describe('loadMinPriceArs', () => {
    it('cae al default sin config', async () => {
      await expect(build().loadMinPriceArs()).resolves.toBe(
        DEFAULT_MIN_PRICE_ARS,
      );
    });

    it('ignora valores no numéricos o <= 0', async () => {
      const basura = build([{ key: 'pricing_minimum_charge', value: 'abc' }]);
      await expect(basura.loadMinPriceArs()).resolves.toBe(
        DEFAULT_MIN_PRICE_ARS,
      );

      const cero = build([{ key: 'pricing_minimum_charge', value: '0' }]);
      await expect(cero.loadMinPriceArs()).resolves.toBe(DEFAULT_MIN_PRICE_ARS);
    });
  });

  describe('calculateCost (créditos)', () => {
    const config = { baseRate: 1, minimumCharge: 5, workerRate: 50 };

    it('cobra distancia redondeada hacia arriba más los ayudantes', async () => {
      // ceil(10.2 * 1) + 2*50 = 11 + 100
      await expect(build().calculateCost(10.2, 2, config)).resolves.toBe(111);
    });

    it('nunca baja del mínimo', async () => {
      await expect(build().calculateCost(1, 0, config)).resolves.toBe(5);
    });
  });

  describe('calculateEstimatedPriceArs (pesos)', () => {
    const charter = {
      pricePerKm: 1000,
      pricePerWaitBlock: 5000,
      chargesReturnTrip: true,
    };

    it('sin pricePerKm configurado no hay estimado', () => {
      const r = build().calculateEstimatedPriceArs(
        50,
        20,
        { ...charter, pricePerKm: null },
        DEFAULT_MIN_PRICE_ARS,
      );
      expect(r).toEqual({ total: null, ida: null, wait: null, return: null });
    });

    it('el total mostrado es solo la ida, no la suma de los tramos', () => {
      const r = build().calculateEstimatedPriceArs(
        50,
        20,
        charter,
        DEFAULT_MIN_PRICE_ARS,
      );

      expect(r.ida).toBe(50000);
      expect(r.total).toBe(50000); // ida, sin sumarle espera ni vuelta
      expect(r.wait).toBe(5000);
      expect(r.return).toBe(20 * 1000 * RETURN_TRIP_FACTOR);
    });

    it('aplica el mínimo cuando la ida queda por debajo', () => {
      const r = build().calculateEstimatedPriceArs(
        1,
        0,
        charter,
        DEFAULT_MIN_PRICE_ARS,
      );
      expect(r.ida).toBe(1000);
      expect(r.total).toBe(DEFAULT_MIN_PRICE_ARS);
    });

    it('no cobra vuelta si el charter no la cobra', () => {
      const r = build().calculateEstimatedPriceArs(
        50,
        20,
        { ...charter, chargesReturnTrip: false },
        DEFAULT_MIN_PRICE_ARS,
      );
      expect(r.return).toBe(0);
    });
  });
});
