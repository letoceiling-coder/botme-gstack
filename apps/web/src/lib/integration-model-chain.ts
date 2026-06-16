import type { IntegrationDto, ModelCacheDto } from '@botme/shared';

/** Models pickable for an agent when integration defines a chain (order preserved). */
export function modelsForIntegrationPicker(
  integration: IntegrationDto | undefined,
  syncedModels: ModelCacheDto[],
): ModelCacheDto[] {
  const chain = integration?.modelChain?.filter((c) => c.enabled) ?? [];
  if (chain.length === 0) return syncedModels;

  const byExternalId = new Map(syncedModels.map((m) => [m.externalId, m]));
  return chain.map((item) => {
    const cached = byExternalId.get(item.modelId);
    if (cached) return cached;
    return {
      id: `chain:${item.modelId}`,
      externalId: item.modelId,
      displayName: item.modelId,
      contextWindow: 0,
      promptPrice: null,
      completionPrice: null,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: false,
      isFree: /free/i.test(item.modelId),
      syncedAt: '',
    };
  });
}

export function defaultPrimaryModelId(integration: IntegrationDto | undefined): string {
  const first = integration?.modelChain?.find((c) => c.enabled);
  return first?.modelId ?? '';
}
