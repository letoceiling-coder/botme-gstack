import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, PageSkeleton } from '@botme/ui';
import { ru } from '@/i18n/ru';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function DashboardPage() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace-summary', session?.workspace.id],
    queryFn: () => api.workspaceSummary(),
    enabled: Boolean(session),
  });

  const switchMutation = useMutation({
    mutationFn: (workspaceId: string) => api.switchWorkspace(workspaceId),
    onSuccess: (next) => {
      useAuthStore.getState().setSession(next);
      void queryClient.invalidateQueries();
    },
  });

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{ru.dashboard.title}</h1>
        <p className="mt-1 text-sm text-zinc-400">{session.workspace.name}</p>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : isError ? (
        <p className="text-sm text-red-400">{ru.common.error}</p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={ru.dashboard.members} value={String(data.stats.memberCount)} />
          <StatCard label="Агенты" value={String(data.stats.agentsCount)} muted />
          <StatCard label="Диалоги" value={String(data.stats.conversationsCount)} muted />
          <StatCard label="Лиды" value={String(data.stats.leadsCount)} muted />
        </div>
      ) : null}

      <Card>
        <p className="text-sm text-zinc-400">{ru.dashboard.phaseNote}</p>
      </Card>

      {session.workspaces.length > 1 ? (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-white">{ru.common.switchWorkspace}</h2>
          <div className="flex flex-wrap gap-2">
            {session.workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                disabled={ws.id === session.workspace.id || switchMutation.isPending}
                onClick={() => switchMutation.mutate(ws.id)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm transition-colors',
                  ws.id === session.workspace.id
                    ? 'border-[#39ff14]/40 bg-[#39ff14]/10 text-[#39ff14]'
                    : 'border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/5',
                ].join(' ')}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card hover className="!p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${muted ? 'text-zinc-400' : 'text-white'}`}>
        {value}
      </p>
    </Card>
  );
}
