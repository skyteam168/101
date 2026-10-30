import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERM_KEY } from '../decorators/require-perm.decorator';
import { BusinessError } from '../errors/business.error';
import { AuthUser } from '../../modules/auth/auth.types';
import { RbacService } from '../../modules/rbac/rbac.service';

@Injectable()
export class PermGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      throw new BusinessError('UNAUTHORIZED', undefined, 401);
    }

    // 超级管理员放行
    if (user.isSuperAdmin) {
      return true;
    }

    const codes = await this.rbacService.getUserPermissionCodes(user.id);
    const ok = required.every((p) => codes.includes(p));
    if (!ok) {
      throw new BusinessError('FORBIDDEN', undefined, 403);
    }
    return true;
  }
}
