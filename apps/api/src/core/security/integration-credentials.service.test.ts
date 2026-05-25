import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { IntegrationCredentialsService } from './integration-credentials.service';

describe('IntegrationCredentialsService', () => {
  const config = {
    get: (key: string) =>
      key === 'MASTER_ENCRYPTION_KEY'
        ? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        : undefined,
  } as ConfigService;

  const service = new IntegrationCredentialsService(config);

  it('encrypts and decrypts roundtrip', () => {
    const stored = service.encryptApiKey('sk-live-secret-key-1234', 'ws_a');
    const decrypted = service.decryptApiKey(stored, 'ws_a');
    expect(decrypted.apiKey).toBe('sk-live-secret-key-1234');
    expect(decrypted.keyVersion).toBe(1);
  });

  it('masks keys without exposing plaintext pattern beyond prefix/suffix', () => {
    const masked = service.maskKey('sk-live-secret-key-1234');
    expect(masked).toContain('••••');
    expect(masked).not.toBe('sk-live-secret-key-1234');
    expect(masked.endsWith('1234')).toBe(true);
  });

  it('uses distinct ciphertext per workspace', () => {
    const a = service.encryptApiKey('same-key', 'ws_a');
    const b = service.encryptApiKey('same-key', 'ws_b');
    expect(Buffer.compare(a.encryptedSecret, b.encryptedSecret)).not.toBe(0);
  });
});
