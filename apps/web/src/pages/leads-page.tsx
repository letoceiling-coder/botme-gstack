import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { LeadDto } from '@botme/shared';
import { Badge, Button, Card, Select, SelectOption } from '@botme/ui';
import { api } from '@/lib/api';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED', 'SPAM'] as const;

function statusVariant(status: string): 'success' | 'warning' | 'muted' {
  if (status === 'QUALIFIED' || status === 'CLOSED') return 'success';
  if (status === 'SPAM') return 'warning';
  return 'muted';
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const leadsQuery = useQuery({
    queryKey: ['leads', status, search],
    queryFn: () =>
      api.leads.list({
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: string }) =>
      api.leads.update(id, { status: next as LeadDto['status'] }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  const exportCsv = () => {
    window.open('/api/leads/export.csv', '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Лиды</h1>
          <p className="mt-1 text-sm text-muted-foreground">Контакты из виджета и Lead Saver tool.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-48">
          <SelectOption value="">Все статусы</SelectOption>
          {STATUSES.map((s) => (
            <SelectOption key={s} value={s}>{s}</SelectOption>
          ))}
        </Select>
        <input
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="Поиск по имени, email, телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {leadsQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-4">Контакт</th>
                <th className="p-4">Статус</th>
                <th className="p-4">Источник</th>
                <th className="p-4">Ассистент</th>
                <th className="p-4">Дата</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {(leadsQuery.data ?? []).map((lead) => (
                <tr key={lead.id} className="border-b border-border/50">
                  <td className="p-4">
                    <div className="font-medium">{lead.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{lead.email ?? lead.phone ?? '—'}</div>
                  </td>
                  <td className="p-4">
                    <Select
                      value={lead.status}
                      onChange={(e) => updateMutation.mutate({ id: lead.id, status: e.target.value })}
                      className="w-36"
                    >
                      {STATUSES.map((s) => (
                        <SelectOption key={s} value={s}>{s}</SelectOption>
                      ))}
                    </Select>
                  </td>
                  <td className="p-4"><Badge variant="muted">{lead.source}</Badge></td>
                  <td className="p-4 text-muted-foreground">{lead.assistantName ?? '—'}</td>
                  <td className="p-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleString('ru')}</td>
                  <td className="p-4">
                    {lead.conversationId && (
                      <Link to={`/admin/assistants/${lead.assistantId}/chat`} className="text-primary hover:underline">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(leadsQuery.data ?? []).length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Лидов пока нет.</p>
          )}
        </Card>
      )}
    </div>
  );
}
