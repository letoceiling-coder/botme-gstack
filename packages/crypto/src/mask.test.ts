import { describe, expect, it } from 'vitest';
import { maskApiKey } from './mask.js';

describe('maskApiKey', () => {
  it('masks long sk- keys', () => {
    expect(maskApiKey('sk-proj-abcdefghijklmnop')).toBe('sk-••••mnop');
  });

  it('masks short keys fully', () => {
    expect(maskApiKey('abc')).toBe('••••••••');
  });

  it('masks empty keys', () => {
    expect(maskApiKey('')).toBe('••••••••');
  });
});
