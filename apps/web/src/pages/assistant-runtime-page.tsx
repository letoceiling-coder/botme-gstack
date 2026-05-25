import { useQuery } from '@tanstack/react-query';
import { Loader2, Network } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card } from '@botme/ui';
import { api } from '@/lib/api';
import { ru } from '@/i18n/ru';

export function AssistantRuntimePage() {
  const { id } = useParams<{ id: string }>();

  const runtimeQuery = useQuery({
    queryKey: ['assistant-runtime', id],
    queryFn: () => api.assistants.runtime(id!),
    enabled: !!id,
  });

  if (runtimeQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#39ff14]" />
      </div>
    );
  }

  const snap = runtimeQuery.data;
  if (!snap) {
    return <p className="text-zinc-500">Runtime недоступен</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/assistants" className="text-xs text-zinc-500 hover:text-[#39ff14]">
          ← {ru.assistants.title}
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold text-white">
          <Network className="h-5 w-5 text-[#39ff14]" />
          {ru.assistants.runtimeView}: {snap.assistant.name}
        </h1>
        <p className="text-xs text-zinc-500">
          Snapshot {snap.snapshotId} · {new Date(snap.resolvedAt).toLocaleString('ru-RU')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/10 bg-black/20 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Assistant</h3>
          <dl className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between"><dt>Slug</dt><dd>{snap.assistant.slug}</dd></div>
            <div className="flex justify-between"><dt>Tone</dt><dd>{snap.assistant.tone}</dd></div>
            <div className="flex justify-between"><dt>Visibility</dt><dd>{snap.assistant.visibility}</dd></div>
            <div className="flex justify-between"><dt>Active</dt><dd>{snap.assistant.isActive ? 'Да' : 'Нет'}</dd></div>
          </dl>
        </Card>

        <Card className="border-white/10 bg-black/20 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Agent (runtime)</h3>
          <dl className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between"><dt>Name</dt><dd>{snap.agent.name}</dd></div>
            <div className="flex justify-between"><dt>Model</dt><dd className="font-mono text-xs">{snap.agent.modelId}</dd></div>
            <div className="flex justify-between"><dt>Provider</dt><dd>{snap.integration.provider}</dd></div>
            <div className="flex justify-between"><dt>Integration</dt><dd>{snap.integration.name}</dd></div>
            <div className="flex justify-between"><dt>Prompt v{snap.promptVersion.version}</dt><dd className="truncate max-w-[120px]">{snap.promptVersion.content.slice(0, 40)}…</dd></div>
          </dl>
        </Card>

        <Card className="border-white/10 bg-black/20 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Knowledge Bases</h3>
          {snap.knowledgeBases.length === 0 ? (
            <p className="text-sm text-zinc-500">Нет привязок</p>
          ) : (
            <ul className="space-y-2">
              {snap.knowledgeBases.map((kb) => (
                <li key={kb.id} className="flex items-center justify-between text-sm text-zinc-300">
                  {kb.name}
                  <Badge variant="muted">{kb.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-white/10 bg-black/20 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Tools</h3>
          {snap.tools.length === 0 ? (
            <p className="text-sm text-zinc-500">Нет привязок</p>
          ) : (
            <ul className="space-y-2">
              {snap.tools.map((tool) => (
                <li key={tool.id} className="flex items-center justify-between text-sm text-zinc-300">
                  {tool.name}
                  <Badge variant="muted">{tool.type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="md:col-span-2 border-white/10 bg-black/20 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-medium text-[#39ff14]">Runtime Settings</h3>
          <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300 sm:grid-cols-3">
            <div>Context: {snap.runtimeSettings.maxContextMessages}</div>
            <div>Memory: {snap.runtimeSettings.memoryEnabled ? 'on' : 'off'}</div>
            <div>Streaming: {snap.runtimeSettings.streamingEnabled ? 'on' : 'off'}</div>
            <div>Citations: {snap.runtimeSettings.citationsEnabled ? 'on' : 'off'}</div>
            <div>Moderation: {snap.runtimeSettings.moderationEnabled ? 'on' : 'off'}</div>
            <div>Typing: {snap.runtimeSettings.typingSimulation ? 'on' : 'off'}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
