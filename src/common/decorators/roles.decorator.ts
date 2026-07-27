import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums';

export const ROLES_KEY = 'roles';

/**
 * Restringe un handler (o un controller entero) a los roles indicados.
 * Requiere que el controller declare `@UseGuards(JwtAuthGuard, RolesGuard)`:
 * RolesGuard lee `request.user`, que lo puebla JwtAuthGuard.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
