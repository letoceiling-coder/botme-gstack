/** Nav visibility + backend readiness. Phase 0: visible routes show honest empty states. */
export const FEATURES = {
  dashboard: true,
  agents: true,
  assistants: true,
  tools: true,
  knowledge: true,
  integrations: true,
  leads: true,
  widgets: true,
  operator: true,
  analytics: false,
  settings: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export const API_ROUTES = {
  health: '/health',
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    switchWorkspace: '/auth/switch-workspace',
  },
  workspaces: {
    list: '/workspaces',
    create: '/workspaces',
  },
} as const;

export const WS_NAMESPACES = {
  admin: '/admin',
  widget: '/widget',
  operator: '/operator',
} as const;

export const REDIS_CHANNEL_PREFIX = 'botme' as const;

/** Server-side feature flags — override via env in API bootstrap. */
export const FEATURE_FLAGS = {
  rtcCalls: false,
  turnRelay: false,
} as const;

export const HEARTBEAT_INTERVAL_MS = 25_000;
export const HEARTBEAT_TIMEOUT_MS = 60_000;
