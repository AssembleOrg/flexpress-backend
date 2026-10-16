import { Logger } from '@nestjs/common';
import {
  AUTO_OFF_TYPE,
  CharterAvailabilityService,
  STALE_WARNING_TYPE,
} from './charter-availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogService } from '../common/services/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * El cron de inactividad tiene que ser conservador: avisar antes de apagar,
 * nunca apagar a quien está en viaje y nunca apagar si volvió entre medio.
 */
describe('CharterAvailabilityService.expireStaleAvailability', () => {
  const H = 60 * 60 * 1000;
  const hoursAgo = (h: number) => new Date(Date.now() - h * H);

  const build = ({
    warning = null as Date | null,
    busy = false,
    updated = 1,
  } = {}) => {
    const prisma = {
      charterAvailability: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'av1',
            charterId: 'c1',
            lastToggledAt: hoursAgo(30),
            charter: { lastLoginAt: hoursAgo(28) },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: updated }),
      },
      travelMatch: {
        findMany: jest.fn().mockResolvedValue(busy ? [{ charterId: 'c1' }] : []),
      },
      trip: { findMany: jest.fn().mockResolvedValue([]) },
      notification: {
        findMany: jest
          .fn()
          .mockResolvedValue(warning ? [{ userId: 'c1', createdAt: warning }] : []),
      },
    };
    const notifications = { createOrUpdate: jest.fn().mockResolvedValue({}) };
    const activityLog = { logFeature: jest.fn().mockResolvedValue(undefined) };
    const service = new CharterAvailabilityService(
      prisma as unknown as PrismaService,
      activityLog as unknown as ActivityLogService,
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, notifications };
  };

  const sentTypes = (n: { createOrUpdate: jest.Mock }) =>
    n.createOrUpdate.mock.calls.map(([dto]: [{ type: string }]) => dto.type);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('sin aviso previo: avisa y NO apaga', async () => {
    const { service, prisma, notifications } = build();
    await service.expireStaleAvailability();
    expect(sentTypes(notifications)).toEqual([STALE_WARNING_TYPE]);
    expect(prisma.charterAvailability.updateMany).not.toHaveBeenCalled();
  });

  it('aviso anterior a su última actividad no cuenta: vuelve a avisar', async () => {
    const { service, prisma, notifications } = build({ warning: hoursAgo(40) });
    await service.expireStaleAvailability();
    expect(sentTypes(notifications)).toEqual([STALE_WARNING_TYPE]);
    expect(prisma.charterAvailability.updateMany).not.toHaveBeenCalled();
  });

  it('avisado hace menos de 2h: espera', async () => {
    const { service, prisma, notifications } = build({ warning: hoursAgo(1) });
    await service.expireStaleAvailability();
    expect(notifications.createOrUpdate).not.toHaveBeenCalled();
    expect(prisma.charterAvailability.updateMany).not.toHaveBeenCalled();
  });

  it('avisado hace más de 2h sin volver: apaga y avisa', async () => {
    const { service, prisma, notifications } = build({ warning: hoursAgo(3) });
    await service.expireStaleAvailability();
    expect(prisma.charterAvailability.updateMany).toHaveBeenCalledTimes(1);
    expect(sentTypes(notifications)).toEqual([AUTO_OFF_TYPE]);
  });

  it('si volvió entre la lectura y el update (count 0): no notifica', async () => {
    const { service, notifications } = build({ warning: hoursAgo(3), updated: 0 });
    await service.expireStaleAvailability();
    expect(notifications.createOrUpdate).not.toHaveBeenCalled();
  });

  it('en viaje: no se toca', async () => {
    const { service, prisma, notifications } = build({ warning: hoursAgo(3), busy: true });
    await service.expireStaleAvailability();
    expect(notifications.createOrUpdate).not.toHaveBeenCalled();
    expect(prisma.charterAvailability.updateMany).not.toHaveBeenCalled();
  });
});
