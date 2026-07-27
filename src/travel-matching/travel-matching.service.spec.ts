import { BadRequestException, ConflictException } from '@nestjs/common';
import { TravelMatchingService } from './travel-matching.service';
import { getCharterCreditCost } from './credit-cost.util';
import { PrismaService } from '../prisma/prisma.service';
import { TravelMatchingGateway } from './travel-matching.gateway';
import { ConversationsService } from '../conversations/conversations.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Guarda de regresión de la carrera de aceptación.
 *
 * Antes del fix, el saldo se leía con findUnique y se validaba con un `if`.
 * Aceptar dos matches distintos en paralelo pasaba ambos chequeos con el mismo
 * saldo leído y dejaba los créditos en negativo. Ahora tanto el estado del
 * match como el saldo viajan en el WHERE del UPDATE.
 */
describe('TravelMatchingService — aceptar match', () => {
  const match = {
    id: 'm1',
    userId: 'client1',
    charterId: 'charter1',
    status: 'pending',
    distanceKm: 45, // → 3 créditos, tramo intermedio
    destinationAddress: 'x',
    destinationLatitude: '1',
    destinationLongitude: '2',
    workersCount: 1,
    cargoDescription: null,
    scheduledDate: new Date(),
    conversationId: null,
    user: { id: 'client1', credits: 5, name: 'Cliente' },
    charter: { id: 'charter1', credits: 10, name: 'Charter', number: '+54 9 11 1111-1111' },
  };

  type Counts = { claim: number; charter: number; client: number };

  const build = (counts: Partial<Counts> = {}) => {
    const c: Counts = { claim: 1, charter: 1, client: 1, ...counts };

    const tx = {
      travelMatch: {
        updateMany: jest.fn().mockResolvedValue({ count: c.claim }),
        update: jest.fn(),
      },
      user: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: c.charter })
          .mockResolvedValueOnce({ count: c.client }),
        update: jest.fn(),
      },
      tripPersonnel: { create: jest.fn().mockResolvedValue({ id: 'tp1' }) },
    };

    const prisma = {
      travelMatch: {
        findUnique: jest.fn().mockResolvedValue(match),
        update: jest.fn().mockResolvedValue(match),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      charterAvailability: { findUnique: jest.fn().mockResolvedValue(null) },
      charterDriver: { findFirst: jest.fn().mockResolvedValue(null) },
      charterHelper: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;

    const gateway = { server: { to: () => ({ emit: jest.fn() }) }, notifyUser: jest.fn() };
    const conversations = {
      createConversation: jest.fn().mockResolvedValue({ data: { id: 'c1' } }),
    };
    const notifications = { createOrUpdate: jest.fn().mockResolvedValue(undefined) };

    const service = new TravelMatchingService(
      prisma,
      gateway as unknown as TravelMatchingGateway,
      conversations as unknown as ConversationsService,
      notifications as unknown as NotificationsService,
    );

    return { service, prisma, tx };
  };

  const accept = () => ({ accept: true }) as never;

  it('reclama el match con status pending en el WHERE', async () => {
    const { service, tx } = build();
    await service.respondToMatch('charter1', 'm1', accept());

    expect(tx.travelMatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', status: 'pending' },
      data: { status: 'accepted' },
    });
  });

  it('descuenta al charter exigiendo saldo suficiente en el WHERE', async () => {
    const { service, tx } = build();
    await service.respondToMatch('charter1', 'm1', accept());

    const costo = getCharterCreditCost(match.distanceKm);
    expect(tx.user.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'charter1', credits: { gte: costo } },
      data: { credits: { decrement: costo } },
    });
  });

  it('cobra al cliente exigiendo al menos 1 crédito en el WHERE', async () => {
    const { service, tx } = build();
    await service.respondToMatch('charter1', 'm1', accept());

    expect(tx.user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'client1', credits: { gte: 1 } },
      data: { credits: { decrement: 1 } },
    });
  });

  it('el monto validado es el mismo que el cobrado', async () => {
    const { service, tx } = build();
    await service.respondToMatch('charter1', 'm1', accept());

    const [[charterCall]] = (tx.user.updateMany as jest.Mock).mock.calls;
    expect(charterCall.where.credits.gte).toBe(
      charterCall.data.credits.decrement,
    );
  });

  it('tira 409 si otro request ya respondió el match', async () => {
    const { service, tx } = build({ claim: 0 });

    await expect(
      service.respondToMatch('charter1', 'm1', accept()),
    ).rejects.toThrow(ConflictException);
    // no se toca ningún saldo si no se pudo reclamar el match
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('tira 400 si el saldo del charter se agotó entre el read y el UPDATE', async () => {
    const { service, tx } = build({ charter: 0 });

    await expect(
      service.respondToMatch('charter1', 'm1', accept()),
    ).rejects.toThrow(BadRequestException);
    expect(tx.tripPersonnel.create).not.toHaveBeenCalled();
  });

  it('tira 400 si el cliente se quedó sin créditos', async () => {
    const { service, tx } = build({ client: 0 });

    await expect(
      service.respondToMatch('charter1', 'm1', accept()),
    ).rejects.toThrow(BadRequestException);
    expect(tx.tripPersonnel.create).not.toHaveBeenCalled();
  });

  it('nunca descuenta sin condición de saldo', async () => {
    const { service, tx } = build();
    await service.respondToMatch('charter1', 'm1', accept());

    // user.update() sin WHERE de saldo es exactamente el bug que se corrigió
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('getCharterCreditCost', () => {
  it.each([
    [null, 2],
    [0, 2],
    [30, 2],
    [30.5, 3],
    [45, 3],
    [60, 3],
    [61, 4],
    [500, 4],
  ])('%s km → %s créditos', (km, esperado) => {
    expect(getCharterCreditCost(km as number | null)).toBe(esperado);
  });
});
