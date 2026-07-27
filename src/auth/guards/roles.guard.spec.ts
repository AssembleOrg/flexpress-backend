import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../common/enums';

/**
 * El guard es la única barrera de varios endpoints de admin, así que lo que
 * importa acá es que no se vuelva permisivo por accidente.
 */
describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const contextWithUser = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const requireRoles = (roles: UserRole[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  describe('sin @Roles en el handler', () => {
    it('deja pasar: convive con los chequeos inline que ya existían', () => {
      requireRoles(undefined);
      expect(guard.canActivate(contextWithUser({ role: 'user' }))).toBe(true);
    });

    it('un array vacío también deja pasar', () => {
      requireRoles([]);
      expect(guard.canActivate(contextWithUser({ role: 'user' }))).toBe(true);
    });
  });

  describe('con @Roles(ADMIN, SUBADMIN)', () => {
    beforeEach(() => requireRoles([UserRole.ADMIN, UserRole.SUBADMIN]));

    it.each([UserRole.ADMIN, UserRole.SUBADMIN])('deja pasar a %s', (role) => {
      expect(guard.canActivate(contextWithUser({ role }))).toBe(true);
    });

    it.each([UserRole.USER, UserRole.CHARTER])('rechaza a %s', (role) => {
      expect(() => guard.canActivate(contextWithUser({ role }))).toThrow(
        ForbiddenException,
      );
    });

    // Este es el caso que convertía la escalada de privilegios en posible:
    // si el guard corre sin request.user (por ejemplo registrado como guard
    // global, que corre antes que JwtAuthGuard), tiene que negar, no permitir.
    it('rechaza cuando no hay usuario en el request', () => {
      expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
        ForbiddenException,
      );
    });

    it('rechaza un rol desconocido', () => {
      expect(() =>
        guard.canActivate(contextWithUser({ role: 'superadmin' })),
      ).toThrow(ForbiddenException);
    });
  });
});
