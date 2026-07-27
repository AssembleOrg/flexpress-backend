import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';

/**
 * Autorización por rol declarativa. Sin `@Roles()` en el handler ni en la
 * clase, deja pasar: sirve para convivir con los chequeos inline que ya
 * existen sin romper endpoints abiertos a cualquier autenticado.
 *
 * Va SIEMPRE después de JwtAuthGuard en `@UseGuards(...)`: los guards de
 * controller se ejecutan en orden y este necesita `request.user` ya cargado.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('No tenés permisos para esta operación');
    }

    return true;
  }
}
