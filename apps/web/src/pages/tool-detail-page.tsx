import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Play, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Select, SelectOption } from '@botme/ui';
import { api, ApiError } from '@/lib/api';

export function ToolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [testInput, setTestInput] = useState('{}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toolQuery = useQuery({
    queryKey: ['tools', id],
    queryFn: () => api.tools.get(id!),
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: (enabled: boolean) => api.tools.update(id!, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tools'] });
      void queryClient.invalidateQueries({ queryKey: ['tools', id] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(testInput) as Record<string, unknown>;
      } catch {
        throw new ApiError('Невалидный JSON', 400);
      }
      return api.tools.test(id!, { input });
    },
    onSuccess: (res) => {
      setTestResult(JSON.stringify(res, null, 2));
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['tools', id] });
    },
    onError: (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Ошибка теста'),
  });

  const tool = toolQuery.data;

  if (toolQuery.isLoading || !tool) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/admin/tools" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> К инструментам
          </Link>
          <h1 className="text-2xl font-semibold">{tool.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
        </div>
        <Button
          variant={tool.enabled ? 'secondary' : 'primary'}
          onClick={() => updateMutation.mutate(!tool.enabled)}
          disabled={updateMutation.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {tool.enabled ? 'Отключить' : 'Включить'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Схема</h2>
          <pre className="overflow-auto rounded-lg bg-muted/40 p-4 text-xs">
            {JSON.stringify(tool.schema, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">{tool.type}</Badge>
            <Badge variant="muted">timeout {tool.timeoutMs}ms</Badge>
            {tool.permissions.map((p) => (
              <Badge key={p} variant="muted">{p}</Badge>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-medium">Тестирование</h2>
          <textarea
            className="min-h-[120px] w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Запустить тест
          </Button>
          {testResult && (
            <pre className="overflow-auto rounded-lg bg-muted/40 p-4 text-xs">{testResult}</pre>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-medium">Последние запуски</h2>
        {tool.recentExecutions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Запусков пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Статус</th>
                  <th className="pb-2 pr-4">Latency</th>
                  <th className="pb-2 pr-4">Retries</th>
                  <th className="pb-2">Время</th>
                </tr>
              </thead>
              <tbody>
                {tool.recentExecutions.map((e) => (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2 pr-4">
                      <Badge variant={e.status === 'SUCCESS' ? 'success' : 'warning'}>{e.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{e.latencyMs ?? '—'} ms</td>
                    <td className="py-2 pr-4">{e.retryCount}</td>
                    <td className="py-2">{new Date(e.createdAt).toLocaleString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {tool.boundAssistantIds.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-2 font-medium">Привязанные ассистенты</h2>
          <p className="text-sm text-muted-foreground">{tool.boundAssistantIds.length} ассистент(ов)</p>
        </Card>
      )}
    </div>
  );
}
