import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TravelMatchingGateway } from '../travel-matching/travel-matching.gateway';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * El chat es el canal por el que cliente y charter coordinan un viaje ya
 * pagado, así que lo que importa es quién puede leer y escribir en él.
 */
describe('ConversationsService', () => {
  const conversation = {
    id: 'c1',
    userId: 'cliente1',
    charterId: 'charter1',
    status: 'active',
    expiresAt: new Date(Date.now() + 3600_000),
    user: { id: 'cliente1', name: 'Cliente' },
    charter: { id: 'charter1', name: 'Charter' },
    travelMatch: { id: 'm1' },
  };

  const build = (overrides: Record<string, unknown> | null = {}) => {
    const found = overrides === null ? null : { ...conversation, ...overrides };

    const prisma = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue(found),
      },
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'msg1',
          content: 'hola',
          sender: { id: 'cliente1', name: 'Cliente', avatar: null },
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      travelMatch: { findUnique: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;

    const gateway = {
      server: {
        to: () => ({ emit: jest.fn() }),
        // sendMessage consulta quién está en la sala para decidir si además
        // manda push, así que el doble tiene que soportar in().fetchSockets().
        in: () => ({ fetchSockets: jest.fn().mockResolvedValue([]) }),
      },
      notifyUser: jest.fn(),
    } as unknown as TravelMatchingGateway;

    const notifications = {
      createOrUpdate: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsService;

    return {
      service: new ConversationsService(prisma, gateway, notifications),
      prisma,
    };
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  const dto = { content: 'hola' } as never;

  describe('sendMessage', () => {
    it('deja escribir al cliente de la conversación', async () => {
      const { service, prisma } = build();
      await service.sendMessage('c1', 'cliente1', dto);
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('deja escribir al charter de la conversación', async () => {
      const { service, prisma } = build();
      await service.sendMessage('c1', 'charter1', dto);
      expect(prisma.message.create).toHaveBeenCalled();
    });

    // El caso que importa: un tercero que adivine el id no puede meterse en
    // la coordinación de un viaje ajeno.
    it('rechaza a alguien ajeno a la conversación', async () => {
      const { service, prisma } = build();
      await expect(
        service.sendMessage('c1', 'intruso', dto),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rechaza si la conversación no existe', async () => {
      const { service } = build(null);
      await expect(service.sendMessage('c1', 'cliente1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rechaza si la conversación está cerrada', async () => {
      const { service } = build({ status: 'closed' });
      await expect(service.sendMessage('c1', 'cliente1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza y marca expirada si venció', async () => {
      const { service, prisma } = build({
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.sendMessage('c1', 'cliente1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'expired' }),
        }),
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('rechaza a alguien ajeno a la conversación', async () => {
      const { service } = build();
      await expect(service.getMessages('c1', 'intruso')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deja leer a un participante', async () => {
      const { service } = build();
      await expect(service.getMessages('c1', 'charter1')).resolves.toBeDefined();
    });
  });
});
