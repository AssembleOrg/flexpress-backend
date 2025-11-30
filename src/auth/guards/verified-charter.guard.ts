import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class VerifiedCharterGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Permitir usuarios regulares (no charters)
    if (user.role !== 'charter') {
      return true;
    }

    // Bloquear charters que no están verificados
    if (user.verificationStatus !== 'verified') {
      throw new ForbiddenException(
        'Tu cuenta de charter está pendiente de verificación por parte del administrador.'
      );
    }

    return true;
  }
}
