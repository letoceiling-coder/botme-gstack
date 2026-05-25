import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { ALLOW_CROSS_WORKSPACE_KEY } from '../decorators/allow-cross-workspace.decorator';

/** Blocks cross-workspace ID injection via params or body. */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const allowCross = this.reflector.getAllAndOverride<boolean>(ALLOW_CROSS_WORKSPACE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowCross) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.workspaceId) {
      return true;
    }

    const jwtWorkspaceId = request.user.workspaceId;
    const paramId = request.params?.['workspaceId'] as string | undefined;
    const body = request.body as Record<string, unknown> | undefined;
    const bodyId = typeof body?.['workspaceId'] === 'string' ? body['workspaceId'] : undefined;

    for (const candidate of [paramId, bodyId]) {
      if (candidate && candidate !== jwtWorkspaceId) {
        throw new ForbiddenException('Cross-workspace access denied');
      }
    }

    return true;
  }
}
