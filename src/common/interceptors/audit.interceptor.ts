import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { AUDITORY_KEY } from '../decorators/auditory.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { GeolocationService } from '../services/geolocation.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    @Inject(PrismaService) private prisma: PrismaService,
    private geolocationService: GeolocationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const entityType = this.reflector.get<string>(
      AUDITORY_KEY,
      context.getHandler(),
    );

    if (!entityType) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { method, url, body, params, query, user } = request;
    const locationInfo =
      this.geolocationService.getLocationFromRequest(request);
    const ipAddress = locationInfo.ip;
    const location = locationInfo.formatted;

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.logAudit({
            entityType,
            entityId: this.getEntityId(method, params, body, response),
            action: method,
            oldValues:
              method === 'PUT' || method === 'PATCH'
                ? this.getOldValues(request)
                : null,
            newValues:
              method === 'POST' || method === 'PUT' || method === 'PATCH'
                ? body
                : null,
            ipAddress,
            location,
            userId: user?.id,
          });
        } catch (error) {
          console.error('Error logging audit:', error);
        }
      }),
    );
  }

  private getEntityId(
    method: string,
    params: any,
    body: any,
    response: any,
  ): string {
    if (method === 'POST' && response?.id) {
      return response.id;
    }
    if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      return params.id || body.id;
    }
    return 'unknown';
  }

  private getOldValues(request: any): any {
    // In a real application, you would fetch the old values from the database
    // For now, we'll return null
    return null;
  }

  private async logAudit(auditData: {
    entityType: string;
    entityId: string;
    action: string;
    oldValues: any;
    newValues: any;
    ipAddress: string;
    location: string;
    userId?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        entityType: auditData.entityType,
        entityId: auditData.entityId,
        action: auditData.action,
        oldValues: auditData.oldValues
          ? JSON.stringify(auditData.oldValues)
          : undefined,
        newValues: auditData.newValues
          ? JSON.stringify(auditData.newValues)
          : undefined,
        ipAddress: auditData.ipAddress,
        location: auditData.location,
        userId: auditData.userId,
      },
    });
  }
}
