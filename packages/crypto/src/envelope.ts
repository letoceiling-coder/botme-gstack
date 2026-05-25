import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

export class EnvelopeEncryptionService {
  constructor(private readonly masterKeyHex: string) {
    if (masterKeyHex.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
  }

  deriveWorkspaceKey(workspaceId: string, keyVersion = 1): Buffer {
    const master = Buffer.from(this.masterKeyHex, 'hex');
    return createHash('sha256')
      .update(master)
      .update(workspaceId)
      .update(String(keyVersion))
      .digest();
  }

  encrypt(plaintext: string, workspaceId: string, keyVersion = 1): EncryptedPayload {
    const key = this.deriveWorkspaceKey(workspaceId, keyVersion);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: encrypted, iv, tag, keyVersion };
  }

  decrypt(payload: EncryptedPayload, workspaceId: string): string {
    const key = this.deriveWorkspaceKey(workspaceId, payload.keyVersion);
    const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
    decipher.setAuthTag(payload.tag);
    const decrypted = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  pack(payload: EncryptedPayload): Buffer {
    return Buffer.concat([payload.iv, payload.tag, payload.ciphertext]);
  }

  unpack(packed: Buffer | Uint8Array, keyVersion: number): EncryptedPayload {
    const buffer = Buffer.isBuffer(packed) ? packed : Buffer.from(packed);
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);
    return { iv, tag, ciphertext, keyVersion };
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
