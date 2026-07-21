import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { PrismaService } from '../prisma/prisma.service';
import { UploadScope } from './dto/presign-upload.dto';

type Visibility = 'public' | 'private';

interface ScopeConfig {
  visibility: Visibility;
  folder: string;
  allowedTypes: string[];
  /** true si el entityId es obligatorio (vehicle/personnel); false si usa el user del JWT */
  requiresEntity: boolean;
}

// heic/heif aceptados como defensa: normalmente el frontend convierte a JPEG antes de
// subir, pero si algún path sube HEIC crudo, no lo rechazamos en el presign.
const IMG = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const IMG_PDF = [...IMG, 'application/pdf'];

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf']);
const MAX_SIZE = 4 * 1024 * 1024; // 4MB

interface AuthUser {
  id: string;
  role: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;
  private bucket: string;
  private env: string;
  private cdnBase?: string;
  private readTtl: number;
  private uploadTtl: number;

  private readonly SCOPES: Record<UploadScope, ScopeConfig> = {
    [UploadScope.AVATAR]: {
      visibility: 'public',
      folder: 'avatars',
      allowedTypes: IMG,
      requiresEntity: false,
    },
    [UploadScope.PERSONNEL_PHOTO]: {
      visibility: 'public',
      folder: 'personal',
      allowedTypes: IMG,
      requiresEntity: false, // opcional: en alta el driver aún no existe → usa user.id
    },
    [UploadScope.VEHICLE_FOTO]: {
      visibility: 'public',
      folder: 'vehiculo-foto',
      allowedTypes: IMG,
      requiresEntity: true,
    },
    [UploadScope.USER_DNI]: {
      visibility: 'private',
      folder: 'dni',
      allowedTypes: IMG,
      requiresEntity: false,
    },
    [UploadScope.VEHICLE_DOC]: {
      visibility: 'private',
      folder: 'vehiculo-doc',
      allowedTypes: IMG_PDF,
      requiresEntity: true,
    },
    [UploadScope.PERSONNEL_DOC]: {
      visibility: 'private',
      folder: 'personal-doc',
      allowedTypes: IMG,
      requiresEntity: false, // en alta usa user.id
    },
    [UploadScope.RECEIPT]: {
      visibility: 'private',
      folder: 'comprobantes',
      allowedTypes: IMG_PDF,
      requiresEntity: false,
    },
  };

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('spaces.endpoint');
    const region = this.config.get<string>('spaces.region');
    const accessKeyId = this.config.get<string>('spaces.accessKey');
    const secretAccessKey = this.config.get<string>('spaces.secretKey');
    this.bucket = this.config.get<string>('spaces.bucket') ?? '';
    this.env = this.config.get<string>('spaces.env') ?? 'dev';
    this.cdnBase = this.config.get<string>('spaces.cdnBase');
    this.readTtl = this.config.get<number>('spaces.readTtl') ?? 3600;
    this.uploadTtl = this.config.get<number>('spaces.uploadTtl') ?? 300;

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn(
        'DigitalOcean Spaces no está configurado (faltan env vars). Las subidas fallarán hasta setearlas.',
      );
      return;
    }

    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle: false,
      credentials: { accessKeyId, secretAccessKey },
      // DigitalOcean Spaces no soporta el checksum CRC32 que el SDK v3 agrega por
      // default; sin esto el PUT presignado del navegador falla con 403 (visto como CORS).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private ensureConfigured() {
    if (!this.s3) {
      throw new BadRequestException(
        'El almacenamiento no está configurado en el servidor.',
      );
    }
  }

  private isAdmin(user: AuthUser): boolean {
    return ['admin', 'subadmin'].includes(user.role);
  }

  private safeExt(fileName: string, contentType: string): string {
    const raw = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (raw && ALLOWED_EXT.has(raw)) return raw;
    // derivar de contentType
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType === 'image/png') return 'png';
    if (contentType === 'image/webp') return 'webp';
    return 'jpg';
  }

  /** Construye la key: {env}/{public|private}/{folder}/{ownerId}/{uuid}.{ext} */
  private buildKey(cfg: ScopeConfig, ownerId: string, ext: string): string {
    return `${this.env}/${cfg.visibility}/${cfg.folder}/${ownerId}/${randomUUID()}.${ext}`;
  }

  /**
   * Valida que el usuario del JWT tenga permiso de subir en ese scope+entidad.
   * Corrige el agujero previo: el ownerId real sale de la DB / JWT, no del cliente.
   * Devuelve el ownerId a usar en la key.
   */
  private async assertUploadOwnership(
    user: AuthUser,
    scope: UploadScope,
    entityId?: string,
  ): Promise<string> {
    switch (scope) {
      case UploadScope.AVATAR:
      case UploadScope.USER_DNI:
      case UploadScope.RECEIPT:
        return user.id;

      case UploadScope.VEHICLE_FOTO:
      case UploadScope.VEHICLE_DOC: {
        if (!entityId)
          throw new BadRequestException('entityId (vehicleId) es requerido');
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: entityId, charterId: user.id },
          select: { id: true },
        });
        if (!vehicle)
          throw new ForbiddenException('El vehículo no te pertenece');
        return entityId;
      }

      case UploadScope.PERSONNEL_PHOTO:
      case UploadScope.PERSONNEL_DOC: {
        // Si no hay entityId (alta del driver/helper), agrupamos bajo el charter (user.id).
        if (!entityId) return user.id;
        const driver = await this.prisma.charterDriver.findFirst({
          where: { id: entityId, charterId: user.id },
          select: { id: true },
        });
        if (driver) return entityId;
        const helper = await this.prisma.charterHelper.findFirst({
          where: { id: entityId, charterId: user.id },
          select: { id: true },
        });
        if (helper) return entityId;
        throw new ForbiddenException('El personal no te pertenece');
      }

      default:
        throw new BadRequestException('Scope inválido');
    }
  }

  async presignUpload(
    user: AuthUser,
    dto: {
      scope: UploadScope;
      contentType: string;
      fileName: string;
      entityId?: string;
      size?: number;
    },
  ): Promise<{
    uploadUrl: string;
    fields: Record<string, string>;
    key: string;
    publicUrl?: string;
  }> {
    this.ensureConfigured();

    const cfg = this.SCOPES[dto.scope];
    if (!cfg) throw new BadRequestException('Scope inválido');

    if (!cfg.allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido para ${dto.scope}: ${dto.contentType}`,
      );
    }
    if (dto.size != null && dto.size > MAX_SIZE) {
      throw new BadRequestException('El archivo supera los 4MB');
    }

    const ownerId = await this.assertUploadOwnership(
      user,
      dto.scope,
      dto.entityId,
    );
    const ext = this.safeExt(dto.fileName, dto.contentType);
    const key = this.buildKey(cfg, ownerId, ext);

    // Presigned POST (no PUT): un POST multipart desde el navegador NO dispara preflight
    // OPTIONS (es "simple request"), lo que evita el 403 que DigitalOcean Spaces devuelve al
    // preflight de un PUT presignado. El content-type va en la policy, no como header firmado.
    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, MAX_SIZE], // límite duro server-side (0..4MB)
        { 'Content-Type': dto.contentType }, // igualdad exacta (cubre image/* y application/pdf)
      ],
      Fields: {
        'Content-Type': dto.contentType,
      },
      Expires: this.uploadTtl,
    });

    if (cfg.visibility === 'public') {
      const publicUrl = this.cdnBase
        ? `${this.cdnBase}/${key}`
        : `${this.config.get<string>('spaces.endpoint')}/${this.bucket}/${key}`;
      return { uploadUrl: url, fields, key, publicUrl };
    }
    // privados: key (se persiste como fileUrl) + fields para el POST
    return { uploadUrl: url, fields, key };
  }

  /**
   * Firma una URL de lectura temporal para un objeto privado.
   * Los no-admin solo pueden leer objetos bajo su propio prefijo de owner.
   */
  async presignRead(user: AuthUser, key: string): Promise<{ url: string }> {
    this.ensureConfigured();

    if (!key || !key.startsWith(`${this.env}/`)) {
      throw new BadRequestException('Key inválida');
    }
    if (key.includes('..')) {
      throw new BadRequestException('Key inválida');
    }

    // Los objetos public/ (avatars, fotos) los puede leer CUALQUIER usuario autenticado:
    // un cliente ve el avatar del charter y viceversa. Los private/ exigen ser admin o dueño.
    const isPublicKey = key.startsWith(`${this.env}/public/`);
    if (!isPublicKey && !this.isAdmin(user)) {
      // no-admin: la key debe contener su propio id como owner segment
      if (!key.includes(`/${user.id}/`)) {
        throw new ForbiddenException('No autorizado a leer este archivo');
      }
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.s3, command, {
      expiresIn: this.readTtl,
    });
    return { url };
  }

  /**
   * Borra todos los objetos bajo un prefijo (usado al eliminar cuenta).
   * Recorre paginando y borra en batches de 1000.
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    if (!this.s3) return 0;
    let deleted = 0;
    let token: string | undefined;
    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      const objects = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objects.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects },
          }),
        );
        deleted += objects.length;
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  /**
   * Borra todo el storage asociado a un usuario: sus propios archivos (avatar/dni/receipts)
   * y los de sus entidades hijas (vehículos, drivers, helpers), en public/ y private/.
   */
  async deleteUserStorage(
    userId: string,
    entityIds: string[] = [],
  ): Promise<void> {
    if (!this.s3) return;
    const owners = [userId, ...entityIds];
    for (const visibility of ['public', 'private']) {
      for (const owner of owners) {
        // prefijo por owner dentro de cada folder → borramos por owner cruzando folders
        // key: {env}/{visibility}/{folder}/{owner}/...
        // no conocemos el folder, así que listamos por owner con un prefijo parcial no es directo;
        // borramos folder por folder sería más preciso, pero owner es único (cuid) → filtramos por sufijo /owner/
        await this.deleteByPrefixMatchingOwner(visibility, owner);
      }
    }
  }

  private async deleteByPrefixMatchingOwner(
    visibility: string,
    owner: string,
  ): Promise<void> {
    // Lista todo el visibility root y borra las keys cuyo segmento owner coincide.
    // Como cuid es único global, /{owner}/ solo aparece en carpetas de ese dueño.
    let token: string | undefined;
    const base = `${this.env}/${visibility}/`;
    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: base,
          ContinuationToken: token,
        }),
      );
      const objects = (list.Contents ?? [])
        .filter((o) => o.Key?.includes(`/${owner}/`))
        .map((o) => ({ Key: o.Key! }));
      if (objects.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects },
          }),
        );
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
}
