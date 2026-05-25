import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProviderType } from '@botme/database';

export interface ResolvedProviderCredentials {
  apiKey: string;
  baseUrl?: string;
}

@Injectable()
export class ProviderCredentialsResolver {
  constructor(private readonly config: ConfigService) {}

  resolveForIntegration(
    provider: AiProviderType,
    decryptedApiKey: string,
  ): ResolvedProviderCredentials {
    if (provider === 'OLLAMA_NEEKLO') {
      return {
        apiKey: decryptedApiKey,
        baseUrl: this.config.get<string>(
          'OLLAMA_NEEKLO_BASE_URL',
          'https://ollama.neeklo.ru/v1',
        ),
      };
    }
    return { apiKey: decryptedApiKey };
  }

  requireOllamaNeekloToken(): string {
    const token = this.config.get<string>('OLLAMA_NEEKLO_TOKEN');
    if (!token?.trim()) {
      throw new ServiceUnavailableException(
        'Ollama Neeklo не настроен на сервере (OLLAMA_NEEKLO_TOKEN)',
      );
    }
    return token.trim();
  }

  isEnvManaged(provider: AiProviderType): boolean {
    return provider === 'OLLAMA_NEEKLO';
  }
}
