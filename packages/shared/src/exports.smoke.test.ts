import { describe, expect, it } from 'vitest';

/** Symbols consumed by Vite apps — must exist as static ESM named exports in dist. */
const REQUIRED_NAMED_EXPORTS = [
  'WS_NAMESPACES',
  'HEARTBEAT_INTERVAL_MS',
  'FEATURES',
  'LoginSchema',
  'RegisterSchema',
  'CreateIntegrationSchema',
  'CreateAgentSchema',
  'CreateAssistantSchema',
  'PlaygroundStartSchema',
  'hasMinRole',
  'ROLE_RANK',
] as const;

describe('@botme/shared public exports (dist ESM)', () => {
  it('dist/index.js exposes all required named exports for Rollup/Vite', async () => {
    const mod = await import('../dist/index.js');

    for (const name of REQUIRED_NAMED_EXPORTS) {
      expect(mod[name], `missing export: ${name}`).toBeDefined();
    }

    expect(mod.WS_NAMESPACES).toEqual({ admin: '/admin', widget: '/widget', operator: '/operator' });
  });

  it('dist/index.cjs exposes all required named exports for Node CJS', async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const mod = require('../dist/index.cjs') as Record<string, unknown>;

    for (const name of REQUIRED_NAMED_EXPORTS) {
      expect(mod[name], `missing export: ${name}`).toBeDefined();
    }
  });
});
