import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { AgentRuntimeDiagnosticsDto } from '@botme/shared';
import { Badge, Button, Card } from '@botme/ui';
import { api } from '@/lib/api';

type Props = {
  agentId: string;
};

export function AgentDiagnosticsPanel({ agentId }: Props) {
  const diagnosticsQuery = useQuery({
    queryKey: ['agent-diagnostics', agentId],
    queryFn: () => api.agents.runtimeDiagnostics(agentId),
    enabled: !!agentId,
    refetchInterval: 5000,
  });

  const diag = diagnosticsQuery.data;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#39ff14]" />
          <h3 className="text-sm font-medium text-white">Runtime diagnostics</h3>
        </div>
        <Button
          variant="ghost"
          className="h-8 gap-1 text-xs"
          onClick={() => void diagnosticsQuery.refetch()}
        >
          <RefreshCw className={`h-3 w-3 ${diagnosticsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {diagnosticsQuery.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[#39ff14]" />
        </div>
      ) : !diag ? (
        <p className="text-sm text-zinc-500">Diagnostics unavailable</p>
      ) : (
        <DiagnosticsBody diag={diag} />
      )}
    </Card>
  );
}

function DiagnosticsBody({ diag }: { diag: AgentRuntimeDiagnosticsDto }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
        <div>
          <dt className="text-xs text-zinc-500">Last model</dt>
          <dd className="font-mono text-xs">{diag.lastUsedModelId ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Last used</dt>
          <dd>{diag.lastUsedAt ? new Date(diag.lastUsedAt).toLocaleString('ru-RU') : '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-zinc-500">Last failover</dt>
          <dd className="flex items-center gap-2">
            {diag.lastFailoverReason ? (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                {diag.lastFailoverReason}
              </>
            ) : (
              'None'
            )}
          </dd>
        </div>
      </dl>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Failover chain</p>
        <ul className="space-y-2">
          {diag.chain.map((link) => (
            <li
              key={`${link.position}-${link.integrationId}-${link.modelId}`}
              className="rounded-lg border border-white/10 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-zinc-400">#{link.position}</span>
                <div className="flex gap-1">
                  {link.enabled ? (
                    <Badge variant="success">enabled</Badge>
                  ) : (
                    <Badge variant="muted">disabled</Badge>
                  )}
                  {link.isFree && <Badge variant="muted">free</Badge>}
                </div>
              </div>
              <p className="mt-1 text-white">{link.modelId}</p>
              <p className="text-xs text-zinc-500">
                {link.provider} · {link.integrationId.slice(0, 8)}…
              </p>
              {link.health && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <span>avg {link.health.avgLatencyMs}ms</span>
                  <span>failures {link.health.consecutiveFailures}</span>
                  {link.health.cooldownUntil && (
                    <span className="col-span-2 text-amber-400">
                      cooldown until {new Date(link.health.cooldownUntil).toLocaleTimeString('ru-RU')}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
