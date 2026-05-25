import { describe, expect, it } from 'vitest';
import { EnvelopeEncryptionService, hashToken } from './envelope.js';

describe('EnvelopeEncryptionService', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const service = new EnvelopeEncryptionService(key);

  it('encrypts and decrypts workspace secrets', () => {
    const payload = service.encrypt('sk-test-key', 'workspace-1');
    const packed = service.pack(payload);
    const unpacked = service.unpack(packed, payload.keyVersion);
    expect(service.decrypt(unpacked, 'workspace-1')).toBe('sk-test-key');
  });

  it('hashes tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('def'));
  });
});
