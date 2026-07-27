import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Los vehículos son de un charter y el admin los verifica. Las reglas que
 * conviene fijar: no operar sobre un vehículo ajeno, no pasarse del máximo por
 * cuenta, y no tocar el vehículo con el que el charter está disponible ahora
 * mismo (si no, un cliente puede terminar contratando algo que ya cambió).
 */
describe('VehiclesService', () => {
  const vehicle = {
    id: 'v1',
    charterId: 'charter1',
    verificationStatus: 'verified',
    isEnabled: false,
    deletedAt: null,
  };

  const build = (opts: {
    vehicle?: Record<string, unknown> | null;
    count?: number;
    availability?: Record<string, unknown> | null;
  } = {}) => {
    const found = opts.vehicle === null ? null : { ...vehicle, ...opts.vehicle };

    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(found),
        findUnique: jest.fn().mockResolvedValue(found),
        count: jest.fn().mockResolvedValue(opts.count ?? 0),
        create: jest.fn().mockResolvedValue({ id: 'nuevo' }),
        update: jest.fn().mockResolvedValue({ id: 'v1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      charterAvailability: {
        findUnique: jest.fn().mockResolvedValue(opts.availability ?? null),
      },
      vehicleDocument: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    } as unknown as PrismaService;

    const notifications = {
      createOrUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;

    return { service: new VehiclesService(prisma, notifications), prisma };
  };

  describe('createVehicle', () => {
    it('permite crear si está por debajo del máximo', async () => {
      const { service, prisma } = build({ count: 1 });
      await service.createVehicle('charter1', {} as never);
      expect(prisma.vehicle.create).toHaveBeenCalled();
    });

    it('rechaza al llegar al máximo de 2 por charter', async () => {
      const { service, prisma } = build({ count: 2 });
      await expect(
        service.createVehicle('charter1', {} as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.vehicle.create).not.toHaveBeenCalled();
    });
  });

  describe('ownership', () => {
    it('updateVehicle rechaza sobre un vehículo ajeno', async () => {
      const { service, prisma } = build();
      await expect(
        service.updateVehicle('v1', 'otroCharter', {} as never),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('deleteVehicle rechaza sobre un vehículo ajeno', async () => {
      const { service } = build();
      await expect(service.deleteVehicle('v1', 'otroCharter')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza si el vehículo no existe', async () => {
      const { service } = build({ vehicle: null });
      await expect(service.deleteVehicle('v1', 'charter1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('toggleEnabled', () => {
    it('no deja habilitar un vehículo sin verificar', async () => {
      const { service } = build({ vehicle: { verificationStatus: 'pending' } });
      await expect(service.toggleEnabled('v1', 'charter1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deja habilitar uno verificado', async () => {
      const { service, prisma } = build();
      await service.toggleEnabled('v1', 'charter1');
      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isEnabled: true } }),
      );
    });
  });

  describe('vehículo en uso mientras el charter está disponible', () => {
    const enUso = { isAvailable: true, vehicleId: 'v1' };

    it('no deja editarlo', async () => {
      const { service } = build({ availability: enUso });
      await expect(
        service.updateVehicle('v1', 'charter1', {} as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('no deja borrarlo', async () => {
      const { service } = build({ availability: enUso });
      await expect(service.deleteVehicle('v1', 'charter1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('no deja deshabilitarlo', async () => {
      const { service } = build({
        vehicle: { isEnabled: true },
        availability: enUso,
      });
      await expect(service.toggleEnabled('v1', 'charter1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sí deja habilitar OTRO vehículo, que no afecta la disponibilidad actual', async () => {
      const { service, prisma } = build({
        availability: { isAvailable: true, vehicleId: 'otroVehiculo' },
      });
      await service.toggleEnabled('v1', 'charter1');
      expect(prisma.vehicle.update).toHaveBeenCalled();
    });
  });

  it('editar un vehículo rechazado lo devuelve a la cola de verificación', async () => {
    const { service, prisma } = build({
      vehicle: { verificationStatus: 'rejected' },
    });

    await service.updateVehicle('v1', 'charter1', { brand: 'X' } as never);

    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationStatus: 'pending',
          rejectionReason: null,
        }),
      }),
    );
  });
});
