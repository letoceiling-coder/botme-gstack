import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  function httpContext(role: string, required?: string[]): ExecutionContext {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }) as AuthenticatedRequest,
      }),
    } as unknown as ExecutionContext;
  }

  it('passes when no roles required', () => {
    expect(guard.canActivate(httpContext('VIEWER', undefined))).toBe(true);
  });

  it('allows OWNER for ADMIN mutation', () => {
    expect(guard.canActivate(httpContext('OWNER', ['ADMIN']))).toBe(true);
  });

  it('allows ADMIN for ADMIN mutation', () => {
    expect(guard.canActivate(httpContext('ADMIN', ['ADMIN']))).toBe(true);
  });

  it('blocks VIEWER for MEMBER mutation', () => {
    expect(() => guard.canActivate(httpContext('VIEWER', ['MEMBER']))).toThrow(ForbiddenException);
  });

  it('allows MEMBER for MEMBER mutation', () => {
    expect(guard.canActivate(httpContext('MEMBER', ['MEMBER']))).toBe(true);
  });
});
