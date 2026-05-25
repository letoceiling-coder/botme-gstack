import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvelopeEncryptionService, maskApiKey } from '@botme/crypto';

export interface StoredCredentials {
  encryptedSecret: Buffer | Uint8Array;
  keyVersion: number;
}

export interface DecryptedCredentials {
  apiKey: string;
  keyVersion: number;
}

@Injectable()
export class IntegrationCredentialsService {
  private readonly crypto: EnvelopeEncryptionService;

  constructor(config: ConfigService) {
    const masterKey = config.get<string>('MASTER_ENCRYPTION_KEY');
    if (!masterKey || masterKey.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be 64 hex characters');
    }
    this.crypto = new EnvelopeEncryptionService(masterKey);
  }

  encryptApiKey(plaintext: string, workspaceId: string, keyVersion = 1): StoredCredentials {
    const payload = this.crypto.encrypt(plaintext.trim(), workspaceId, keyVersion);
    return {
      encryptedSecret: this.crypto.pack(payload),
      keyVersion: payload.keyVersion,
    };
  }

  decryptApiKey(stored: StoredCredentials, workspaceId: string): DecryptedCredentials {
    const unpacked = this.crypto.unpack(stored.encryptedSecret, stored.keyVersion);
    return {
      apiKey: this.crypto.decrypt(unpacked, workspaceId),
      keyVersion: stored.keyVersion,
    };
  }

  maskKey(plaintext: string): string {
    return maskApiKey(plaintext);
  }

  maskFromStored(stored: StoredCredentials, workspaceId: string): string {
    const { apiKey } = this.decryptApiKey(stored, workspaceId);
    return maskApiKey(apiKey);
  }
}
