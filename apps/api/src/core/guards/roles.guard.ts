import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { WorkspaceRole } from '@botme/shared';
import { ROLE_RANK } from '@botme/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import type { JwtPayload } from '@botme/shared';
import type { Socket } from 'socket.io';

interface RoleAwareSocketData {
  user?: JwtPayload;
  role?: WorkspaceRole;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<WorkspaceRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const role = this.resolveRole(context);
    if (!role) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const userRank = ROLE_RANK[role];
    const minRequired = Math.min(...required.map((r) => ROLE_RANK[r]));
    if (userRank < minRequired) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return true;
  }

  private resolveRole(context: ExecutionContext): WorkspaceRole | undefined {
    const type = context.getType<'http' | 'ws' | 'rpc'>();

    if (type === 'ws') {
      const client = context.switchToWs().getClient<Socket>();
      const data = client.data as RoleAwareSocketData;
      return data.user?.role ?? data.role;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user?.role;
  }
}
