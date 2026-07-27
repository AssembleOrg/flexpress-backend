import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';
import { PushService } from '../push/push.service';
import { NotificationPriority } from '@prisma/client';

/**
 * El dedupe era check-then-act: dos eventos simultáneos con la misma clave
 * pasaban ambos por el findFirst vacío y creaban dos notificaciones. Medido
 * contra la base: 12 llamadas concurrentes producían 4 filas.
 *
 * Ahora todo pasa por una transacción con advisory lock. Estos tests fallan si
 * alguien saca el lock o vuelve a hacer el findFirst fuera de la transacción.
 */
describe('NotificationsService.createOrUpdate', () => {
  const build = (existing: unknown = null) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      notification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: 'n1', type: 'x' }),
        update: jest.fn().mockResolvedValue({ id: 'n1', type: 'x' }),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      notification: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'n2', type: 'x' }),
        update: jest.fn(),
      },
    } as unknown as PrismaService;

    const gateway = { notifyUser: jest.fn() } as unknown as TravelMatchingGateway;
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) } as unknown as PushService;

    return {
      service: new NotificationsService(prisma, gateway, push),
      prisma,
      tx,
    };
  };

  const dto = {
    userId: 'u1',
    type: 'trip_completed',
    title: 'Listo',
    body: 'El viaje terminó',
    priority: NotificationPriority.HIGH,
    dedupeKey: 'trip_completed:trip:t1',
  } as never;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('con dedupeKey toma el lock antes de mirar si existe', async () => {
    const { service, tx } = build();
    await service.createOrUpdate(dto);

    expect(tx.$executeRaw).toHaveBeenCalled();
    const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder[0];
    const findCallOrder = tx.notification.findFirst.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(findCallOrder);
  });

  it('la búsqueda y la escritura ocurren dentro de la misma transacción', async () => {
    const { service, prisma, tx } = build();
    await service.createOrUpdate(dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    // fuera de la transacción no se toca nada
    expect((prisma.notification.findFirst as jest.Mock)).not.toHaveBeenCalled();
    expect((prisma.notification.create as jest.Mock)).not.toHaveBeenCalled();
  });

  it('si ya hay una sin leer la actualiza en vez de crear otra', async () => {
    const { service, tx } = build({ id: 'existente', data: null });
    await service.createOrUpdate(dto);

    expect(tx.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existente' } }),
    );
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('sin dedupeKey crea directo, sin lock ni transacción', async () => {
    const { service, prisma } = build();
    await service.createOrUpdate({ ...(dto as object), dedupeKey: undefined } as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
