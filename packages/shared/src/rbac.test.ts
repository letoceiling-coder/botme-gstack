import { describe, expect, it } from 'vitest';
import { hasMinRole, RBAC, ROLE_RANK } from './rbac.js';

describe('RBAC', () => {
  it('ranks roles correctly', () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.MEMBER);
    expect(ROLE_RANK.MEMBER).toBeGreaterThan(ROLE_RANK.VIEWER);
  });

  it('allows ADMIN to mutate integrations', () => {
    expect(hasMinRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasMinRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasMinRole('MEMBER', 'ADMIN')).toBe(false);
  });

  it('documents integration mutate roles', () => {
    expect(RBAC.integrations.mutate).toContain('ADMIN');
    expect(RBAC.integrations.mutate).toContain('OWNER');
  });
});
