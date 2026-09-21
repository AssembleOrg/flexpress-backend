import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';

// Cuántos días de historial se conservan en audit_logs. Pasado esto, el cron
// diario los borra: la tabla no crece indefinidamente y el disco queda acotado.
const RETENTION_DAYS = 45;

export interface AuditStats {
  chartersAvailableNow: number;
  totalCharters: number;
  totalClients: number;
  activeLast24h: number;
}

export interface AuditFeedItem {
  id: string;
  createdAt: Date;
  userName: string;
  feature: string | null;
  status: string | null;
}

export interface AuditFeedResult {
  items: AuditFeedItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Limpieza diaria a las 3:30am: borra eventos de auditoría más viejos que
  // RETENTION_DAYS. Mismo patrón que los otros crons de limpieza del proyecto.
  @Cron('30 3 * * *')
  async cleanupOldLogs(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleanup: eliminados ${result.count} audit_logs con más de ${RETENTION_DAYS} días`,
      );
    }
  }

  async getStats(): Promise<AuditStats> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [chartersAvailableNow, totalCharters, totalClients, activeLast24h] = await Promise.all([
      this.prisma.charterAvailability.count({ where: { isAvailable: true } }),
      this.prisma.user.count({ where: { role: UserRole.CHARTER, deletedAt: null } }),
      this.prisma.user.count({ where: { role: UserRole.USER, deletedAt: null } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: since }, deletedAt: null } }),
    ]);

    return { chartersAvailableNow, totalCharters, totalClients, activeLast24h };
  }

  async getFeed(params: { feature?: string; page?: number; limit?: number }): Promise<AuditFeedResult> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    // Solo eventos semánticos: el interceptor genérico (si se reactiva) deja feature null.
    const where = params.feature ? { feature: params.feature } : { feature: { not: null } };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Resolver nombres en un solo query; userId huérfano (usuario borrado) → fallback.
    const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const items: AuditFeedItem[] = logs.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      userName: (l.userId && nameById.get(l.userId)) || 'Usuario eliminado',
      feature: l.feature,
      status: l.status,
    }));

    return { items, total, page, limit };
  }
}
