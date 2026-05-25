import type { AiProviderType, ModelDefinition, NormalizedModel } from './types.js';

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: {
    modality?: string;
    instruct_type?: string | null;
  };
  top_provider?: { is_moderated?: boolean };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export function normalizeOpenRouterModels(
  response: OpenRouterModelsResponse,
): NormalizedModel[] {
  return response.data.map((m) => {
    const promptPrice = parsePrice(m.pricing?.prompt);
    const completionPrice = parsePrice(m.pricing?.completion);
    const modality = m.architecture?.modality ?? '';
    const isFree =
      (promptPrice === 0 && completionPrice === 0) ||
      m.id.toLowerCase().includes(':free') ||
      m.id.toLowerCase().endsWith('-free');

    return {
      externalId: m.id,
      provider: 'OPENROUTER' as AiProviderType,
      displayName: m.name ?? m.id,
      contextWindow: m.context_length ?? 0,
      promptPrice,
      completionPrice,
      supportsTools: inferToolsSupport(m.id, modality),
      supportsVision: modality.includes('image'),
      supportsReasoning: m.id.includes('o1') || m.id.includes('reasoning'),
      isFree,
    };
  });
}

export function toModelDefinitions(models: NormalizedModel[]): ModelDefinition[] {
  return models.map(({ provider: _p, ...rest }) => rest);
}

function parsePrice(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferToolsSupport(modelId: string, modality: string): boolean {
  const id = modelId.toLowerCase();
  if (id.includes('embedding') || id.includes('whisper') || id.includes('dall-e')) {
    return false;
  }
  return !modality.includes('embed');
}

interface OpenAiModel {
  id: string;
  owned_by?: string;
}

interface OpenAiModelsResponse {
  data: OpenAiModel[];
}

export function normalizeOpenAiModels(response: OpenAiModelsResponse): NormalizedModel[] {
  return response.data
    .filter((m) => isOpenAiChatModel(m.id))
    .map((m) => ({
      externalId: m.id,
      provider: 'OPENAI' as AiProviderType,
      displayName: m.id,
      contextWindow: 0,
      promptPrice: null,
      completionPrice: null,
      supportsTools: m.id.startsWith('gpt-4') || m.id.startsWith('gpt-3.5'),
      supportsVision: m.id.includes('vision') || m.id.startsWith('gpt-4o'),
      supportsReasoning: m.id.startsWith('o1') || m.id.startsWith('o3'),
      isFree: false,
    }));
}

function isOpenAiChatModel(id: string): boolean {
  if (id.includes('embed') || id.includes('whisper') || id.includes('tts')) return false;
  if (id.includes('dall-e') || id.includes('moderation')) return false;
  return id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('chatgpt');
}

interface OllamaModelsResponse {
  data: Array<{ id: string; owned_by?: string }>;
}

export function normalizeOllamaModels(response: OllamaModelsResponse): NormalizedModel[] {
  return response.data
    .filter((m) => !m.id.toLowerCase().includes('embed'))
    .map((m) => ({
      externalId: m.id,
      provider: 'OLLAMA_NEEKLO' as AiProviderType,
      displayName: m.id,
      contextWindow: 8192,
      promptPrice: 0,
      completionPrice: 0,
      supportsTools: !m.id.toLowerCase().includes('vision'),
      supportsVision: m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('llava'),
      supportsReasoning: false,
      isFree: true,
    }));
}
