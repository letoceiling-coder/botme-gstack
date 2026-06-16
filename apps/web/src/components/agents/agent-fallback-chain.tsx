import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { IntegrationDto, ModelCacheDto } from '@botme/shared';
import { Badge, Button, Input, Select, SelectOption } from '@botme/ui';
import { api } from '@/lib/api';
import { modelsForIntegrationPicker } from '@/lib/integration-model-chain';
import { useQuery } from '@tanstack/react-query';

export type FallbackFormRow = {
  integrationId: string;
  modelId: string;
  enabled: boolean;
  maxRetries: number;
  timeoutMs: number;
};

type Props = {
  primaryIntegrationId: string;
  primaryModelId: string;
  fallbacks: FallbackFormRow[];
  onChange: (rows: FallbackFormRow[]) => void;
  integrations: IntegrationDto[];
};

export function AgentFallbackChainEditor({
  primaryIntegrationId,
  primaryModelId,
  fallbacks,
  onChange,
  integrations,
}: Props) {
  const [search, setSearch] = useState('');
  const [pickIntegrationId, setPickIntegrationId] = useState(primaryIntegrationId);

  const modelsQuery = useQuery({
    queryKey: ['integration-models', pickIntegrationId],
    queryFn: () => api.integrations.models(pickIntegrationId),
    enabled: !!pickIntegrationId,
  });

  const pickIntegration = integrations.find((i) => i.id === pickIntegrationId);

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = modelsForIntegrationPicker(pickIntegration, modelsQuery.data ?? []);
    return pool.filter(
      (m: ModelCacheDto) =>
        !q ||
        m.displayName.toLowerCase().includes(q) ||
        m.externalId.toLowerCase().includes(q),
    );
  }, [modelsQuery.data, search, pickIntegration]);

  const addModel = (m: ModelCacheDto) => {
    const key = `${pickIntegrationId}:${m.externalId}`;
    if (`${primaryIntegrationId}:${primaryModelId}` === key) return;
    if (fallbacks.some((f) => `${f.integrationId}:${f.modelId}` === key)) return;
    onChange([
      ...fallbacks,
      {
        integrationId: pickIntegrationId,
        modelId: m.externalId,
        enabled: true,
        maxRetries: 2,
        timeoutMs: 120_000,
      },
    ]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...fallbacks];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">Fallback chain</p>
        <p className="text-xs text-zinc-500">
          Primary: {primaryModelId || '—'}. Fallbacks run in order on timeout/429/5xx.
        </p>
      </div>

      {fallbacks.map((row, idx) => {
        const integ = integrations.find((i) => i.id === row.integrationId);
        return (
          <div key={`${row.integrationId}-${row.modelId}`} className="flex items-center gap-2 rounded border border-white/10 p-2">
            <span className="w-6 text-xs text-zinc-500">{idx + 2}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{row.modelId}</p>
              <p className="text-xs text-zinc-500">{integ?.name ?? row.integrationId}</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" onClick={() => move(idx, 1)} disabled={idx === fallbacks.length - 1}>
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                className="text-red-400"
                onClick={() => onChange(fallbacks.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="space-y-2 border-t border-white/10 pt-3">
        <Input placeholder="Search models…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={pickIntegrationId} onChange={(e) => setPickIntegrationId(e.target.value)}>
          {integrations.map((i) => (
            <SelectOption key={i.id} value={i.id}>
              {i.name} ({i.provider})
            </SelectOption>
          ))}
        </Select>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {filteredModels.map((m: ModelCacheDto) => (
            <button
              key={m.id}
              type="button"
              onClick={() => addModel(m)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-white/5"
            >
              <span className="truncate text-zinc-200">{m.displayName}</span>
              <span className="flex gap-1 shrink-0 ml-2">
                {m.isFree && <Badge variant="success">free</Badge>}
                {m.supportsTools && <Badge variant="muted">tools</Badge>}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-600 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Click a model to add to chain
        </p>
      </div>
    </div>
  );
}
