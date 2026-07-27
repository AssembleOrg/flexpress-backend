import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RefreshContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Cuánto tiempo después de rotar se sigue tolerando que aparezca el token
 * viejo sin tratarlo como robo. Cubre a los requests que salieron casi juntos
 * (varias pestañas, reintentos de red); un atacante que replique un token
 * guardado va a llegar mucho más tarde que esto.
 */
const REUSE_GRACE_MS = 30_000;

/**
 * Sesiones renovables.
 *
 * El access token pasa a durar poco (JWT_EXPIRES_IN, por defecto 15m) y la
 * sesión larga la sostiene este refresh token, que a diferencia del JWT sí se
 * puede revocar: vive en la base.
 *
 * Reglas:
 *  - Se guarda solo el hash SHA-256. Leer la tabla no sirve para autenticarse.
 *    Se usa SHA-256 y no bcrypt a propósito: el token son 32 bytes aleatorios,
 *    no una contraseña adivinable, y hay que poder buscarlo por índice.
 *  - Rota en cada uso. Un refresh sirve una sola vez.
 *  - Si aparece uno ya rotado, se asume robo y se revoca toda la sesión del
 *    usuario, porque no hay forma de saber cuál de las dos puntas es la buena.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlDays: number;

  constructor(private readonly prisma: PrismaService) {
    const parsed = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    this.ttlDays = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(userId: string, ctx: RefreshContext = {}): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt,
        userAgent: ctx.userAgent?.slice(0, 255),
        ip: ctx.ip?.slice(0, 64),
      },
    });

    return { token, expiresAt };
  }

  /**
   * Canjea un refresh por uno nuevo. Devuelve el userId si el canje es válido.
   */
  async rotate(
    token: string,
    ctx: RefreshContext = {},
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const tokenHash = this.hash(token);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Sesión inválida');
    }

    if (stored.revokedAt) {
      throw new UnauthorizedException('Sesión inválida');
    }

    // Un token ya rotado que vuelve a presentarse es, en principio, señal de
    // robo: el legítimo ya lo canjeó.
    //
    // Pero hay un caso benigno y frecuente: varias pestañas (o varios requests
    // que vencen juntos) canjean el mismo refresh a la vez. El que gana rota, y
    // los que venían atrás llegan con un token recién rotado sin ser atacantes.
    // Revocar ahí mata la sesión de un usuario legítimo, que fue exactamente lo
    // que pasó al probar cinco canjes concurrentes.
    //
    // Por eso hay ventana de gracia: dentro de ella el canje simplemente falla
    // y el cliente reintenta con el token nuevo. Pasada la ventana, un token
    // rotado solo puede venir de una copia guardada: ahí sí se corta todo.
    if (stored.rotatedAt) {
      const rotatedHaceMs = Date.now() - stored.rotatedAt.getTime();

      if (rotatedHaceMs > REUSE_GRACE_MS) {
        this.logger.warn(
          `Refresh token reutilizado ${Math.round(rotatedHaceMs / 1000)}s después de rotar ` +
            `(usuario ${stored.userId}): se revocan todas sus sesiones`,
        );
        await this.revokeAllForUser(stored.userId);
      }

      throw new UnauthorizedException('Sesión inválida');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión expirada');
    }

    // Reclamar la rotación con rotatedAt null en el WHERE: dos refresh
    // simultáneos con el mismo token (típico de varias pestañas) no pueden
    // emitir dos sesiones nuevas.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const refresh = await this.issue(stored.userId, ctx);
    return { userId: stored.userId, refresh };
  }

  /** Logout: corta solo la sesión de este dispositivo. */
  async revoke(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Baneo, cambio de contraseña o sospecha de robo. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Las filas vencidas o revocadas no sirven para nada salvo engordar la tabla.
   * Se conservan 7 días después de vencer para poder investigar un incidente.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Refresh tokens vencidos purgados: ${count}`);
    }
  }
}
