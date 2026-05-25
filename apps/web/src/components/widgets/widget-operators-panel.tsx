import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { WorkspaceMemberDto, WorkspaceRole } from '@botme/shared';
import { OPERATOR_ROLE_DESCRIPTIONS } from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { CopyCard } from './copy-card';
import { HealthStatusChip } from './health-status-chip';

const INVITE_ROLES = ['OPERATOR', 'ADMIN', 'VIEWER', 'MEMBER'] as const;
type InviteRole = (typeof INVITE_ROLES)[number];

export function WidgetOperatorsPanel() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canManage = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('OPERATOR');
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ['workspace-members'],
    queryFn: () => api.members.list(),
  });

  const invitesQuery = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => api.members.listInvites(),
    enabled: canManage,
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.members.invite({ email, role: inviteRole }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-invites'] });
      setEmail('');
      setError(null);
      if (data.invite?.inviteUrl) setLastInviteUrl(data.invite.inviteUrl);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка'),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.members.remove(memberId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role: r }: { id: string; role: InviteRole }) =>
      api.members.updateRole(id, { role: r }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['workspace-members'] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Операторы</h3>
        <p className="text-sm text-muted-foreground">
          Приглашайте операторов, назначайте роли и отслеживайте онлайн-статус.
        </p>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Роли</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(OPERATOR_ROLE_DESCRIPTIONS) as WorkspaceRole[]).map((r) => (
            <div key={r} className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <p className="text-sm font-medium">{OPERATOR_ROLE_DESCRIPTIONS[r].label}</p>
              <p className="text-xs text-muted-foreground">{OPERATOR_ROLE_DESCRIPTIONS[r].description}</p>
            </div>
          ))}
        </div>
      </Card>

      {canManage && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Пригласить оператора</p>
          <Input
            placeholder="email@company.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            value={inviteRole}
            onChange={(e) => {
              const v = e.target.value;
              if (INVITE_ROLES.includes(v as InviteRole)) setInviteRole(v as InviteRole);
            }}
          >
            {INVITE_ROLES.map((r) => (
              <SelectOption key={r} value={r}>
                {OPERATOR_ROLE_DESCRIPTIONS[r].label}
              </SelectOption>
            ))}
          </Select>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            disabled={!email.trim() || inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
          >
            {inviteMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Отправить приглашение
          </Button>
          {lastInviteUrl && (
            <CopyCard label="Ссылка приглашения (скопируйте и отправьте)" value={lastInviteUrl} />
          )}
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Участники workspace</p>
        {(membersQuery.data ?? []).map((m: WorkspaceMemberDto) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium">{m.name ?? m.email}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HealthStatusChip
                status={m.isOnline ? 'online' : 'offline'}
                label={m.isOnline ? 'ONLINE' : 'OFFLINE'}
              />
              <Badge variant="muted">{OPERATOR_ROLE_DESCRIPTIONS[m.role].label}</Badge>
              {canManage && m.role !== 'OWNER' && (
                <>
                  <Select
                    value={m.role}
                    onChange={(e) =>
                      roleMutation.mutate({ id: m.id, role: e.target.value as InviteRole })
                    }
                  >
                    {INVITE_ROLES.map((r) => (
                      <SelectOption key={r} value={r}>
                        {r}
                      </SelectOption>
                    ))}
                  </Select>
                  <Button variant="danger" onClick={() => removeMutation.mutate(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {canManage && (invitesQuery.data?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ожидающие приглашения</p>
          {invitesQuery.data?.map((inv) => (
            <Card key={inv.id} className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  {OPERATOR_ROLE_DESCRIPTIONS[inv.role].label} · до{' '}
                  {new Date(inv.expiresAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <Button variant="secondary" onClick={() => api.members.revokeInvite(inv.id).then(() => invitesQuery.refetch())}>
                Отозвать
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
