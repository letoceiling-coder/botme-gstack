import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { AssistantDto, WidgetDto } from '@botme/shared';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function WidgetsPage() {
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canMutate = role === 'ADMIN' || role === 'OWNER';
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', assistantId: '', domains: '' });

  const widgetsQuery = useQuery({ queryKey: ['widgets'], queryFn: () => api.widgets.list() });
  const assistantsQuery = useQuery({ queryKey: ['assistants'], queryFn: () => api.assistants.list(), enabled: modalOpen });
  const detailQuery = useQuery({
    queryKey: ['widgets', selectedId],
    queryFn: () => api.widgets.get(selectedId!),
    enabled: Boolean(selectedId),
  });
  const previewQuery = useQuery({
    queryKey: ['widgets', selectedId, 'preview-session'],
    queryFn: () => api.widgets.previewSession(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 12 * 60 * 1000,
    refetchInterval: 12 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.widgets.create({
        name: form.name,
        assistantId: form.assistantId,
        domains: form.domains.split('\n').map((d) => d.trim()).filter(Boolean),
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      setSelectedId(data.id);
      setModalOpen(false);
      setForm({ name: '', assistantId: '', domains: '' });
      setError(null);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.widgets.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['widgets'] });
      setSelectedId(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.widgets.update(id, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['widgets'] });
      void queryClient.invalidateQueries({ queryKey: ['widgets', selectedId] });
    },
  });

  const selected = detailQuery.data;
  const assistants = assistantsQuery.data ?? [];

  const copyEmbed = async () => {
    if (!selected?.embedCode) return;
    await navigator.clipboard.writeText(selected.embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Виджеты</h1>
          <p className="mt-1 text-sm text-muted-foreground">Embeddable chat, домены, live preview.</p>
        </div>
        {canMutate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать виджет
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          {(widgetsQuery.data ?? []).map((w: WidgetDto) => (
            <div key={w.id} role="button" tabIndex={0} onClick={() => setSelectedId(w.id)} onKeyDown={(e) => e.key === 'Enter' && setSelectedId(w.id)}>
            <Card
              className={`cursor-pointer p-4 transition ${selectedId === w.id ? 'border-primary' : 'hover:border-primary/30'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">{w.name}</h3>
                  <p className="text-xs text-muted-foreground">{w.assistantName}</p>
                </div>
                <Badge variant={w.isActive ? 'success' : 'muted'}>{w.isActive ? 'Active' : 'Off'}</Badge>
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">{w.publicKey}</p>
            </Card>
            </div>
          ))}
          {widgetsQuery.data?.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">Виджетов пока нет.</Card>
          )}
        </div>

        <div>
          {!selected ? (
            <Card className="flex h-64 items-center justify-center p-8 text-sm text-muted-foreground">
              Выберите виджет для настройки и embed-кода.
            </Card>
          ) : detailQuery.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : selected ? (
            <div className="space-y-4">
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">{selected.name}</h2>
                  {canMutate && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => toggleMutation.mutate({ id: selected.id, isActive: !selected.isActive })}
                      >
                        {selected.isActive ? 'Выключить' : 'Включить'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => deleteMutation.mutate(selected.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Embed code</p>
                  <div className="flex gap-2">
                    <pre className="flex-1 overflow-auto rounded-lg bg-muted/40 p-3 text-xs">{selected.embedCode}</pre>
                    <Button variant="secondary" onClick={copyEmbed}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {copied && <p className="mt-1 text-xs text-primary">Скопировано</p>}
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Разрешённые домены</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.domains.map((d) => (
                      <Badge key={d} variant="muted">{d}</Badge>
                    ))}
                  </div>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {selected.installGuide.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </Card>

              <Card className="overflow-hidden p-0">
                <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">Live preview (desktop)</div>
                {previewQuery.isLoading && !previewQuery.data ? (
                  <div className="flex h-[520px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <iframe
                    title="Widget preview"
                    key={previewQuery.data?.previewToken ?? selected.publicKey}
                    src={previewQuery.data?.previewUrl ?? `/widget/?widgetKey=${selected.publicKey}`}
                    className="h-[520px] w-full bg-background"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                )}
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Новый виджет</h2>
              <button type="button" onClick={() => setModalOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <Input placeholder="Название" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <Select value={form.assistantId} onChange={(e) => setForm((f) => ({ ...f, assistantId: e.target.value }))}>
                <SelectOption value="">Выберите ассистента</SelectOption>
                {assistants.map((a: AssistantDto) => (
                  <SelectOption key={a.id} value={a.id}>{a.name}</SelectOption>
                ))}
              </Select>
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-border bg-background p-3 text-sm"
                placeholder="Домены (по одному на строку)"
                value={form.domains}
                onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                disabled={!form.name || !form.assistantId || !form.domains.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Создать
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
