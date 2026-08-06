import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Guarda de regresión de la carrera de aprobación.
 *
 * Medido contra la base antes del fix: 10 aprobaciones concurrentes del mismo
 * pago acreditaban 9 veces. Lo que lo evita es que la condición viaje en el
 * WHERE del UPDATE, no en un `if` previo, porque Postgres reevalúa el WHERE
 * después de bloquear la fila.
 *
 * Estos tests fallan si alguien vuelve a `update({ where: { id } })`.
 */
describe('PaymentsService — concurrencia', () => {
  const payment = {
    id: 'p1',
    userId: 'u1',
    credits: 25,
    amount: 1000,
    status: 'pending',
  };

  const build = (updateManyCount: number) => {
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
        findUnique: jest.fn().mockResolvedValue({ ...payment, status: 'accepted' }),
        update: jest.fn(),
      },
      user: { update: jest.fn(), updateMany: jest.fn() },
    };

    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(payment),
        updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;

    const notifications = {
      createOrUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;

    return { service: new PaymentsService(prisma, notifications), prisma, tx };
  };

  describe('approvePayment', () => {
    it('reclama el pago con status pending en el WHERE, no con un if previo', async () => {
      const { service, tx } = build(1);
      await service.approvePayment('p1');

      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', status: 'pending' },
        }),
      );
      // update() sin condición volvería a abrir la carrera
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('acredita una sola vez cuando gana la carrera', async () => {
      const { service, tx } = build(1);
      await service.approvePayment('p1');

      expect(tx.user.update).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { credits: { increment: 25 } },
      });
    });

    it('tira 409 y NO acredita cuando otro request ya lo reclamó', async () => {
      const { service, tx } = build(0);

      await expect(service.approvePayment('p1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('rechaza temprano si el pago ya no está pendiente', async () => {
      const { service, prisma } = build(1);
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        ...payment,
        status: 'accepted',
      });

      await expect(service.approvePayment('p1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('rejectPayment', () => {
    it('reclama con status pending en el WHERE', async () => {
      const { service, prisma } = build(1);
      await service.rejectPayment('p1', 'comprobante ilegible');

      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', status: 'pending' },
        }),
      );
    });

    it('tira 409 si ya fue procesado por otro request', async () => {
      const { service } = build(0);
      await expect(service.rejectPayment('p1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

/**
 * Guarda: al crear un pago, se notifica a todos los admins (in-app + web push),
 * uno por admin. Sin esto, el admin solo se entera por el polling de 30s con la
 * app abierta.
 */
describe('PaymentsService.create — aviso a admins', () => {
  const buildCreate = (admins: { id: string }[]) => {
    const created = {
      id: 'p1',
      credits: 25,
      user: { id: 'u1', name: 'Juan', email: 'j@x.com' },
    };

    const prisma = {
      payment: { create: jest.fn().mockResolvedValue(created) },
      user: { findMany: jest.fn().mockResolvedValue(admins) },
    } as unknown as PrismaService;

    const notifications = {
      createOrUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;

    return { service: new PaymentsService(prisma, notifications), notifications };
  };

  it('notifica una vez por cada admin', async () => {
    const { service, notifications } = buildCreate([{ id: 'a1' }, { id: 'a2' }]);
    await service.create({ userId: 'u1', credits: 25 } as never);

    expect(notifications.createOrUpdate).toHaveBeenCalledTimes(2);
    expect(notifications.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'a1', type: 'payment_pending' }),
    );
  });

  it('no rompe la creación si no hay admins', async () => {
    const { service, notifications } = buildCreate([]);
    await expect(
      service.create({ userId: 'u1', credits: 25 } as never),
    ).resolves.toBeDefined();
    expect(notifications.createOrUpdate).not.toHaveBeenCalled();
  });
});
