import { UnsupportedProviderError } from './errors.js';
import { OpenAiAdapter } from './adapters/openai.adapter.js';
import { OpenRouterAdapter } from './adapters/openrouter.adapter.js';
import { OllamaNeekloAdapter } from './adapters/ollama-neeklo.adapter.js';
import type { AiProviderPort, AiProviderType } from './ports.js';
import type { ProviderCredentials, ProviderOptions } from './types.js';

export class AiProviderFactory {
  create(
    provider: AiProviderType,
    credentials: ProviderCredentials,
    options?: ProviderOptions,
  ): AiProviderPort {
    switch (provider) {
      case 'OPENAI':
        return new OpenAiAdapter(credentials, options);
      case 'OPENROUTER':
        return new OpenRouterAdapter(credentials, options);
      case 'OLLAMA_NEEKLO':
        return new OllamaNeekloAdapter(credentials, options);
      default:
        throw new UnsupportedProviderError(provider);
    }
  }
}

export const aiProviderFactory = new AiProviderFactory();

export { UnsupportedProviderError } from './errors.js';
