import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadScope } from './dto/presign-upload.dto';

/**
 * Acá se guardan DNIs, cédulas de vehículo y comprobantes de pago. Lo que hay
 * que garantizar es que la key nunca la elija el cliente y que nadie firme una
 * URL de lectura sobre un archivo privado ajeno.
 */
describe('StorageService', () => {
  const spacesConfig: Record<string, unknown> = {
    'spaces.endpoint': 'https://nyc3.digitaloceanspaces.com',
    'spaces.region': 'nyc3',
    'spaces.bucket': 'test-bucket',
    'spaces.accessKey': 'key',
    'spaces.secretKey': 'secret',
    'spaces.env': 'test',
    'spaces.readTtl': 3600,
    'spaces.uploadTtl': 300,
  };

  const build = (
    prismaOverrides: Record<string, unknown> = {},
  ) => {
    const config = {
      get: jest.fn((k: string) => spacesConfig[k]),
    } as unknown as ConfigService;

    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
      charterDriver: { findFirst: jest.fn().mockResolvedValue(null) },
      charterHelper: { findFirst: jest.fn().mockResolvedValue(null) },
      ...prismaOverrides,
    } as unknown as PrismaService;

    const service = new StorageService(config, prisma);
    // La config de Spaces se lee en onModuleInit, no en el constructor: sin
    // esto el cliente S3 queda sin armar y todo falla con "no configurado".
    service.onModuleInit();

    return { service, prisma };
  };

  const cliente = { id: 'u1', role: 'user' } as never;
  const charter = { id: 'charter1', role: 'charter' } as never;
  const admin = { id: 'a1', role: 'admin' } as never;

  // assertUploadOwnership es privado: se ejerce por su efecto observable.
  const ownership = (service: StorageService) =>
    (service as unknown as {
      assertUploadOwnership: (
        u: unknown,
        s: UploadScope,
        e?: string,
      ) => Promise<string>;
    }).assertUploadOwnership.bind(service);

  describe('dueño de la key en subidas', () => {
    it.each([UploadScope.AVATAR, UploadScope.USER_DNI, UploadScope.RECEIPT])(
      '%s se guarda siempre bajo el id del JWT',
      async (scope) => {
        const { service } = build();
        // Aunque el cliente mande otro entityId, el owner sale del token.
        await expect(ownership(service)(cliente, scope, 'idAjeno')).resolves.toBe(
          'u1',
        );
      },
    );

    it('rechaza subir a un vehículo que no es del charter', async () => {
      const { service } = build();
      await expect(
        ownership(service)(charter, UploadScope.VEHICLE_DOC, 'vehiculoAjeno'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('acepta subir a un vehículo propio', async () => {
      const { service } = build({
        vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1' }) },
      });
      await expect(
        ownership(service)(charter, UploadScope.VEHICLE_DOC, 'v1'),
      ).resolves.toBe('v1');
    });

    it('exige entityId para documentos de vehículo', async () => {
      const { service } = build();
      await expect(
        ownership(service)(charter, UploadScope.VEHICLE_DOC),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza subir a personal ajeno', async () => {
      const { service } = build();
      await expect(
        ownership(service)(charter, UploadScope.PERSONNEL_DOC, 'personaAjena'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sin entityId, el personal se agrupa bajo el charter (alta todavía sin id)', async () => {
      const { service } = build();
      await expect(
        ownership(service)(charter, UploadScope.PERSONNEL_PHOTO),
      ).resolves.toBe('charter1');
    });
  });

  describe('presignRead', () => {
    it('rechaza una key de otro entorno', async () => {
      const { service } = build();
      await expect(
        service.presignRead(cliente, 'produccion/private/dni/u1/x.jpg'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza intentos de salir del prefijo con ..', async () => {
      const { service } = build();
      await expect(
        service.presignRead(cliente, 'test/private/../../etc/passwd'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza leer un archivo privado ajeno', async () => {
      const { service } = build();
      await expect(
        service.presignRead(cliente, 'test/private/dni/OTRO_USUARIO/x.jpg'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deja leer un archivo privado propio', async () => {
      const { service } = build();
      await expect(
        service.presignRead(cliente, 'test/private/dni/u1/x.jpg'),
      ).resolves.toHaveProperty('url');
    });

    it('el admin puede leer cualquier privado', async () => {
      const { service } = build();
      await expect(
        service.presignRead(admin, 'test/private/dni/OTRO_USUARIO/x.jpg'),
      ).resolves.toHaveProperty('url');
    });

    it('los públicos los lee cualquier autenticado (avatares)', async () => {
      const { service } = build();
      await expect(
        service.presignRead(cliente, 'test/public/avatar/OTRO_USUARIO/x.jpg'),
      ).resolves.toHaveProperty('url');
    });
  });
});
