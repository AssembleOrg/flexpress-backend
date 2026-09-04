import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.remove', () => {
  const prisma = {
    user: { findFirst: jest.fn(), update: jest.fn() },
    vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    charterDriver: { findMany: jest.fn().mockResolvedValue([]) },
    charterHelper: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const refreshTokens = { revokeAllForUser: jest.fn() };
  const storage = { deleteUserStorage: jest.fn() };
  const service = new UsersService(
    prisma as any,
    {} as any,
    storage as any,
    {} as any,
    refreshTokens as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rechaza borrar un admin', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'a1', role: 'admin' });
    await expect(service.remove('a1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('404 si no existe', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft-deletea un usuario común', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: 'user' });
    await service.remove('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
