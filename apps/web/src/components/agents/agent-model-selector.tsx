import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Star } from 'lucide-react';
import type { IntegrationDto, ModelCacheDto } from '@botme/shared';
import { Badge, Input, Select, SelectOption } from '@botme/ui';
import { api } from '@/lib/api';
import { modelsForIntegrationPicker } from '@/lib/integration-model-chain';

const PROVIDERS = ['OPENROUTER', 'OPENAI', 'ANTHROPIC', 'OLLAMA_NEEKLO'] as const;

type Props = {
  integrationId: string;
  modelId: string;
  integrations: IntegrationDto[];
  onIntegrationChange: (id: string) => void;
  onModelChange: (id: string) => void;
  disabled?: boolean;
};

export function AgentModelSelector({
  integrationId,
  modelId,
  integrations,
  onIntegrationChange,
  onModelChange,
  disabled,
}: Props) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('ALL');
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  const modelsQuery = useQuery({
    queryKey: ['integration-models', integrationId],
    queryFn: () => api.integrations.models(integrationId),
    enabled: !!integrationId,
  });

  const activeIntegrations = useMemo(
    () => integrations.filter((i) => i.status === 'ACTIVE'),
    [integrations],
  );

  const filteredIntegrations = useMemo(() => {
    if (providerFilter === 'ALL') return activeIntegrations;
    return activeIntegrations.filter((i) => i.provider === providerFilter);
  }, [activeIntegrations, providerFilter]);

  const selectedIntegration = activeIntegrations.find((i) => i.id === integrationId);

  const groupedModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = modelsForIntegrationPicker(selectedIntegration, modelsQuery.data ?? []);
    const models = pool.filter(
      (m: ModelCacheDto) =>
        !q ||
        m.displayName.toLowerCase().includes(q) ||
        m.externalId.toLowerCase().includes(q),
    );
    const fav = models.filter((m) => favorites.has(m.externalId));
    const rest = models.filter((m) => !favorites.has(m.externalId));
    return { fav, rest, all: models };
  }, [modelsQuery.data, search, favorites, selectedIntegration]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Provider</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setProviderFilter('ALL')}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              providerFilter === 'ALL'
                ? 'border-[#39ff14]/40 bg-[#39ff14]/10 text-white'
                : 'border-white/10 text-zinc-400'
            }`}
          >
            All
          </button>
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => setProviderFilter(p)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                providerFilter === p
                  ? 'border-[#39ff14]/40 bg-[#39ff14]/10 text-white'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              {p === 'OLLAMA_NEEKLO' ? 'Ollama' : p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Integration</p>
        <Select
          value={integrationId}
          disabled={disabled}
          onChange={(e) => onIntegrationChange(e.target.value)}
        >
          <SelectOption value="">—</SelectOption>
          {filteredIntegrations.map((i) => (
            <SelectOption key={i.id} value={i.id}>
              {i.name} ({i.provider}){i.isDefault ? ' ★ default' : ''}
            </SelectOption>
          ))}
        </Select>
        {selectedIntegration && (
          <div className="mt-2 flex gap-2">
            <Badge variant={selectedIntegration.status === 'ACTIVE' ? 'success' : 'muted'}>
              {selectedIntegration.status}
            </Badge>
            {selectedIntegration.isDefault && <Badge variant="muted">default</Badge>}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">
          Model
          {selectedIntegration && selectedIntegration.modelChain.length > 0 && (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              ({selectedIntegration.modelChain.length} из цепочки интеграции)
            </span>
          )}
        </p>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            className="pl-9"
            placeholder="Search models…"
            value={search}
            disabled={disabled || !integrationId}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={modelId}
          disabled={disabled || !integrationId || modelsQuery.isLoading}
          onChange={(e) => onModelChange(e.target.value)}
        >
          <SelectOption value="">—</SelectOption>
          {groupedModels.fav.map((m) => (
            <SelectOption key={`fav-${m.id}`} value={m.externalId}>
              ★ {m.displayName}
            </SelectOption>
          ))}
          {groupedModels.rest.map((m) => (
            <SelectOption key={m.id} value={m.externalId}>
              {m.displayName}
            </SelectOption>
          ))}
        </Select>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10">
          {modelsQuery.isLoading ? (
            <p className="p-3 text-xs text-zinc-500">Loading models…</p>
          ) : groupedModels.all.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500">No models synced — run sync in Integrations</p>
          ) : (
            groupedModels.all.map((m: ModelCacheDto) => (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => onModelChange(m.externalId)}
                className={`flex w-full items-start justify-between gap-2 border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-white/[0.03] ${
                  modelId === m.externalId ? 'bg-[#39ff14]/10' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-200">{m.displayName}</p>
                  <p className="truncate font-mono text-zinc-500">{m.externalId}</p>
                  <p className="text-zinc-600">
                    ctx {m.contextWindow.toLocaleString()}
                    {m.promptPrice ? ` · $${m.promptPrice}/M in` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(m.externalId);
                    }}
                    className="text-zinc-500 hover:text-[#39ff14]"
                  >
                    <Star
                      className={`h-3 w-3 ${favorites.has(m.externalId) ? 'fill-[#39ff14] text-[#39ff14]' : ''}`}
                    />
                  </button>
                  <div className="flex flex-wrap justify-end gap-1">
                    {m.isFree && <Badge variant="success">free</Badge>}
                    {m.supportsTools && <Badge variant="muted">tools</Badge>}
                    {m.supportsVision && <Badge variant="muted">vision</Badge>}
                    {m.supportsReasoning && <Badge variant="muted">reason</Badge>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { PROVIDERS };
