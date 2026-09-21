import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface FeatureLog {
  userId?: string;
  entityType: string;
  entityId: string;
  feature: string; // Etiqueta legible ES, ej: "Pidió cargar crédito"
  status?: string; // Estado resultante, ej: "completed", "rejected"
}

/**
 * Registra eventos semánticos de negocio en audit_logs (feed de auditoría del
 * admin). A diferencia del AuditInterceptor genérico, acá guardamos un nombre
 * de feature legible en vez del verbo HTTP.
 *
 * Un fallo de log NUNCA debe tumbar la acción de negocio: todo va en try/catch.
 */
@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logFeature({ userId, entityType, entityId, feature, status }: FeatureLog): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entityType,
          entityId,
          action: 'FEATURE',
          feature,
          status,
          userId,
        },
      });
    } catch (err) {
      this.logger.error(`Fallo al registrar actividad "${feature}" (no crítico): ${err}`);
    }
  }
}
