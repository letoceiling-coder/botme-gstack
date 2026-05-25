import type { WorkspaceRole } from './auth.js';

/** Minimum role ranks — used by RolesGuard and documented for M2+ controllers. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

/**
 * RBAC matrix for Phase 1 modules.
 * Mutations require minRole rank >= ROLE_RANK[minRole].
 */
export const RBAC = {
  integrations: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['ADMIN', 'OWNER'] as const,
  },
  widgetSettings: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['ADMIN', 'OWNER'] as const,
  },
  assistantRuntime: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['ADMIN', 'OWNER'] as const,
  },
  operators: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['ADMIN', 'OWNER'] as const,
  },
  operatorActions: {
    use: ['OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
  },
  agents: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['MEMBER', 'ADMIN', 'OWNER'] as const,
  },
  assistants: {
    read: ['VIEWER', 'OPERATOR', 'MEMBER', 'ADMIN', 'OWNER'] as const,
    mutate: ['MEMBER', 'ADMIN', 'OWNER'] as const,
  },
  playground: {
    use: ['MEMBER', 'ADMIN', 'OWNER'] as const,
  },
} as const;

export type RbacResource = keyof typeof RBAC;

export function hasMinRole(userRole: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}
