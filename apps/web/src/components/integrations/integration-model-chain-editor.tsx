import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { IntegrationModelChainItemInput, ModelCacheDto } from '@botme/shared';
import { OPENROUTER_DEFAULT_MODEL_CHAIN } from '@botme/shared';
import { Badge, Button, Input } from '@botme/ui';

type Props = {
  integrationId: string | null;
  chain: IntegrationModelChainItemInput[];
  onChange: (rows: IntegrationModelChainItemInput[]) => void;
  models: ModelCacheDto[];
  provider: 'OPENAI' | 'OPENROUTER' | 'OLLAMA_NEEKLO';
};

export function IntegrationModelChainEditor({
  integrationId,
  chain,
  onChange,
  models,
  provider,
}: Props) {
  const [search, setSearch] = useState('');
  const [manualId, setManualId] = useState('');

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    const used = new Set(chain.map((c) => c.modelId));
    return models.filter(
      (m) =>
        !used.has(m.externalId) &&
        (!q ||
          m.displayName.toLowerCase().includes(q) ||
          m.externalId.toLowerCase().includes(q)),
    );
  }, [models, chain, search]);

  const addModelId = (modelId: string) => {
    if (!modelId.trim() || chain.some((c) => c.modelId === modelId)) return;
    onChange([...chain, { modelId, enabled: true, maxRetries: 2, timeoutMs: 120_000 }]);
    setManualId('');
  };

  const applyOpenRouterPreset = () => {
    onChange(
      OPENROUTER_DEFAULT_MODEL_CHAIN.map((modelId) => ({
        modelId,
        enabled: true,
        maxRetries: 2,
        timeoutMs: 120_000,
      })),
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...chain];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">Цепочка моделей</p>
        <p className="text-xs text-zinc-500">
          При недоступности модели runtime переходит к следующей. Пустая цепочка — любая доступная
          модель интеграции (сначала бесплатные и дешёвые).
        </p>
      </div>

      {chain.map((row, idx) => (
        <div
          key={`${row.modelId}-${idx}`}
          className="flex items-center gap-2 rounded border border-white/10 p-2"
        >
          <span className="w-6 text-xs text-zinc-500">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{row.modelId}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" onClick={() => move(idx, 1)} disabled={idx === chain.length - 1}>
              <ChevronDown className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              className="text-red-400"
              onClick={() => onChange(chain.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {provider === 'OPENROUTER' && (
        <Button type="button" variant="ghost" className="w-full text-xs" onClick={applyOpenRouterPreset}>
          Шаблон: free → GPT-4o mini → DeepSeek → Qwen
        </Button>
      )}

      {integrationId && models.length > 0 ? (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <Input
            placeholder="Поиск модели…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredModels.slice(0, 20).map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-white/5"
                onClick={() => addModelId(m.externalId)}
              >
                <span className="truncate text-zinc-200">{m.displayName}</span>
                {m.isFree ? <Badge variant="free">free</Badge> : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-white/10 pt-3">
          <Input
            placeholder="openrouter/free"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            className="font-mono text-xs"
          />
          <Button type="button" variant="ghost" onClick={() => addModelId(manualId.trim())}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
