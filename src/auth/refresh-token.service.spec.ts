import { Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * La rotación tiene dos requisitos que se pelean entre sí y por eso conviene
 * fijarlos con tests:
 *
 *  - un refresh robado y replicado tiene que cortar la sesión entera
 *  - varias pestañas canjeando a la vez NO son un robo, y revocarles la sesión
 *    fue exactamente el bug que apareció al probarlo con cinco canjes juntos
 */
describe('RefreshTokenService.rotate', () => {
  const TOKEN = 'un-refresh-cualquiera';
  const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');

  const build = (stored: Record<string, unknown> | null, claimCount = 1) => {
    const prisma = {
      refreshToken: {
        findUnique: jest.fn().mockResolvedValue(stored),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
        create: jest.fn().mockResolvedValue({ id: 'nuevo' }),
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;

    return { service: new RefreshTokenService(prisma), prisma };
  };

  const vigente = {
    id: 'rt1',
    userId: 'u1',
    tokenHash: hashOf(TOKEN),
    expiresAt: new Date(Date.now() + 60_000),
    rotatedAt: null,
    revokedAt: null,
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('busca por hash, nunca por el token en claro', async () => {
    const { service, prisma } = build(vigente);
    await service.rotate(TOKEN);

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashOf(TOKEN) },
    });
    const arg = (prisma.refreshToken.findUnique as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain(TOKEN);
  });

  it('reclama la rotación con rotatedAt null en el WHERE', async () => {
    const { service, prisma } = build(vigente);
    await service.rotate(TOKEN);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt1', rotatedAt: null, revokedAt: null },
      }),
    );
  });

  it('emite un refresh nuevo al rotar', async () => {
    const { service, prisma } = build(vigente);
    const { refresh, userId } = await service.rotate(TOKEN);

    expect(userId).toBe('u1');
    expect(refresh.token).toEqual(expect.any(String));
    expect(refresh.token).not.toBe(TOKEN);
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('rechaza un token inexistente', async () => {
    const { service } = build(null);
    await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token vencido', async () => {
    const { service } = build({
      ...vigente,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token revocado sin revocar nada más', async () => {
    const { service, prisma } = build({ ...vigente, revokedAt: new Date() });

    await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  describe('token ya rotado', () => {
    it('dentro de la ventana de gracia falla pero NO revoca la sesión', async () => {
      // Caso benigno: otra pestaña ganó la carrera hace un segundo.
      const { service, prisma } = build({
        ...vigente,
        rotatedAt: new Date(Date.now() - 1_000),
      });

      await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
      // revokeAllForUser haría un updateMany por userId; no debe pasar
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('pasada la ventana revoca todas las sesiones del usuario', async () => {
      // Caso robo: alguien guardó una copia y la replica más tarde.
      const { service, prisma } = build({
        ...vigente,
        rotatedAt: new Date(Date.now() - 5 * 60_000),
      });

      await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  it('si otro request gana la carrera, falla sin revocar la sesión', async () => {
    const { service, prisma } = build(vigente, 0); // updateMany devuelve count 0

    await expect(service.rotate(TOKEN)).rejects.toThrow(UnauthorizedException);
    // no se emite refresh nuevo para el perdedor
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});
