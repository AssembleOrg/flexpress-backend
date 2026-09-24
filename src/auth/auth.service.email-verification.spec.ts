import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

/**
 * La confirmación de email guarda solo el hash del token y el link vence:
 * un token viejo, usado o de una cuenta borrada no tiene que confirmar nada.
 */
describe('AuthService: confirmación de email', () => {
  const TOKEN = 'token-de-prueba-suficientemente-largo';
  const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');

  const build = (found: Record<string, unknown> | null) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(found),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const mail = {
      frontendUrl: 'https://flex-press.com.ar',
      sendEmailVerification: jest.fn().mockResolvedValue(true),
    };
    const service = new AuthService(
      prisma as any,
      {} as any,
      {} as any,
      mail as any,
    );
    return { service, prisma, mail };
  };

  it('busca por hash y confirma si el link está vigente', async () => {
    const { service, prisma } = build({
      id: 'u1',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
      deletedAt: null,
    });

    await expect(service.verifyEmail(TOKEN)).resolves.toEqual({
      verified: true,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailVerificationTokenHash: hashOf(TOKEN) },
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        emailVerifiedAt: expect.any(Date),
        emailVerificationTokenHash: null,
      }),
    });
  });

  it('rechaza un link vencido', async () => {
    const { service, prisma } = build({
      id: 'u1',
      emailVerificationExpiresAt: new Date(Date.now() - 1),
      deletedAt: null,
    });
    await expect(service.verifyEmail(TOKEN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rechaza un link que no existe o ya se usó', async () => {
    const { service } = build(null);
    await expect(service.verifyEmail(TOKEN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('guarda solo el hash del token y manda el link con el token en claro', async () => {
    const { service, prisma, mail } = build(null);
    await service.sendEmailVerification({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ana',
    });

    const saved = prisma.user.update.mock.calls[0][0].data
      .emailVerificationTokenHash as string;
    const link = mail.sendEmailVerification.mock.calls[0][1] as string;
    const token = decodeURIComponent(new URL(link).searchParams.get('token')!);

    expect(
      link.startsWith('https://flex-press.com.ar/verificar-email?token='),
    ).toBe(true);
    expect(saved).toBe(hashOf(token));
    expect(saved).not.toBe(token);
  });

  it('no reenvía si el email ya está confirmado', async () => {
    const { service, prisma, mail } = build(null);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      name: 'Ana',
      emailVerifiedAt: new Date(),
    });
    await expect(service.resendEmailVerification('u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mail.sendEmailVerification).not.toHaveBeenCalled();
  });
});
