import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Con JWT_EXPIRES_IN=3d, un token sigue siendo válido hasta 3 días después de
 * que el admin da de baja o bloquea la cuenta. La revalidación en cada request
 * es lo único que hace efectiva la sanción antes de que expire, así que estos
 * casos no pueden regresionar.
 */
describe('JwtStrategy.validate', () => {
  const baseUser = {
    id: 'u1',
    email: 'a@b.com',
    name: 'Test',
    role: 'user',
    address: 'x',
    credits: 10,
    documentationFrontUrl: null,
    documentationBackUrl: null,
    number: '+54 9 11 1234-5678',
    avatar: null,
    verificationStatus: 'verified',
    accountStatus: 'active',
    accountStatusNote: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildStrategy = (user: unknown) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaService;

    const config = {
      get: jest.fn().mockReturnValue('un-secreto-de-mas-de-32-caracteres!!'),
    } as unknown as ConfigService;

    return { strategy: new JwtStrategy(config, prisma), prisma };
  };

  it('devuelve el usuario cuando la cuenta está activa', async () => {
    const { strategy } = buildStrategy(baseUser);
    const result = await strategy.validate({ sub: 'u1' });
    expect(result.id).toBe('u1');
    expect(result.role).toBe('user');
  });

  it('no filtra deletedAt hacia request.user', async () => {
    const { strategy } = buildStrategy(baseUser);
    const result = await strategy.validate({ sub: 'u1' });
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('rechaza si el usuario no existe', async () => {
    const { strategy } = buildStrategy(null);
    await expect(strategy.validate({ sub: 'u1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una cuenta dada de baja aunque el token siga vigente', async () => {
    const { strategy } = buildStrategy({ ...baseUser, deletedAt: new Date() });
    await expect(strategy.validate({ sub: 'u1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza una cuenta bloqueada aunque el token siga vigente', async () => {
    const { strategy } = buildStrategy({
      ...baseUser,
      accountStatus: 'banned',
    });
    await expect(strategy.validate({ sub: 'u1' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('incluye el motivo del bloqueo en el mensaje', async () => {
    const { strategy } = buildStrategy({
      ...baseUser,
      accountStatus: 'banned',
      accountStatusNote: 'incumplimiento reiterado',
    });
    await expect(strategy.validate({ sub: 'u1' })).rejects.toThrow(
      /incumplimiento reiterado/,
    );
  });

  it('deja operar a una cuenta con advertencia', async () => {
    const { strategy } = buildStrategy({
      ...baseUser,
      accountStatus: 'warned',
      accountStatusNote: 'primer aviso',
    });
    await expect(strategy.validate({ sub: 'u1' })).resolves.toMatchObject({
      id: 'u1',
    });
  });
});
