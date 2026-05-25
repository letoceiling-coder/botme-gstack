import { describe, expect, it } from 'vitest';
import { FEATURES } from '@botme/shared';

describe('phase 0 foundation', () => {
  it('exposes feature flags for unreleased modules', () => {
    expect(FEATURES.dashboard).toBe(true);
    expect(FEATURES.agents).toBe(true);
    expect(FEATURES.analytics).toBe(false);
  });
});
