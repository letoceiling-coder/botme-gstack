import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PlaygroundMessageDto, PlaygroundUsageDto } from '@botme/shared';
import { hasMinRole } from '@botme/shared';
import { Button, Card, Select, SelectOption } from '@botme/ui';
import { api } from '@/lib/api';
import { getAdminSocket, isAdminSocketConnected } from '@/lib/socket';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  pending?: boolean;
}

export function AgentPlaygroundPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canUse = role ? hasMinRole(role, 'MEMBER') : false;
  const queryClient = useQueryClient();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<PlaygroundUsageDto | null>(null);
  const [promptVersionId, setPromptVersionId] = useState<string>('');
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [forceFailover, setForceFailover] = useState(false);
  const [wsConnected, setWsConnected] = useState(isAdminSocketConnected);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;

    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setWsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.agents.get(agentId!),
    enabled: !!agentId,
  });

  const sessionQuery = useQuery({
    queryKey: ['playground-session', agentId],
    queryFn: () => api.playground.getSession(agentId!),
    enabled: !!agentId,
  });

  useEffect(() => {
    if (sessionQuery.data) {
      setSessionId(sessionQuery.data.id);
      setMessages(
        sessionQuery.data.messages
          .filter((m: PlaygroundMessageDto) => m.role !== 'SYSTEM')
          .map((m) => ({
            id: m.id,
            role: m.role as 'USER' | 'ASSISTANT',
            content: m.content,
          })),
      );
      if (sessionQuery.data.lastLatencyMs && sessionQuery.data.totalTokens) {
        setUsage({
          promptTokens: sessionQuery.data.totalPromptTokens,
          completionTokens: sessionQuery.data.totalCompletionTokens,
          totalTokens: sessionQuery.data.totalTokens,
          latencyMs: sessionQuery.data.lastLatencyMs,
          provider: sessionQuery.data.lastProvider ?? '',
          model: sessionQuery.data.lastModel ?? '',
        });
      }
    }
  }, [sessionQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const clearMutation = useMutation({
    mutationFn: () => api.playground.clearSession(sessionId!),
    onSuccess: async () => {
      setMessages([]);
      setSessionId(null);
      setUsage(null);
      await queryClient.invalidateQueries({ queryKey: ['playground-session', agentId] });
    },
  });

  const attachListeners = useCallback(
    (assistantId: string) => {
      const socket = getAdminSocket();
      if (!socket) return;

      const onChunk = (payload: { sessionId: string; delta: string }) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + payload.delta } : m,
          ),
        );
      };

      const onDone = (payload: {
        sessionId: string;
        content: string;
        usage: PlaygroundUsageDto;
      }) => {
        setSessionId(payload.sessionId);
        setUsage(payload.usage);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: payload.content, pending: false } : m,
          ),
        );
        setStreaming(false);
        void queryClient.invalidateQueries({ queryKey: ['playground-session', agentId] });
        cleanup();
      };

      const onError = (payload: { message: string }) => {
        setStreamError(payload.message || ru.playground.streamError);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setStreaming(false);
        cleanup();
      };

      const onStarted = (payload: { sessionId: string }) => {
        setSessionId(payload.sessionId);
      };

      const onStreamReset = () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: '' } : m)),
        );
      };

      function cleanup() {
        socket?.off('playground:chunk', onChunk);
        socket?.off('playground:stream-reset', onStreamReset);
        socket?.off('playground:done', onDone);
        socket?.off('playground:error', onError);
        socket?.off('playground:started', onStarted);
      }

      socket.on('playground:chunk', onChunk);
      socket.on('playground:stream-reset', onStreamReset);
      socket.on('playground:done', onDone);
      socket.on('playground:error', onError);
      socket.on('playground:started', onStarted);

      return cleanup;
    },
    [agentId, queryClient],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!agentId || !text.trim() || streaming || !canUse) return;

      const socket = getAdminSocket();
      if (!socket?.connected) {
        setStreamError(ru.playground.sendFailed);
        return;
      }

      setStreamError(null);
      setLastUserMessage(text);
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'USER',
        content: text.trim(),
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'ASSISTANT',
        content: '',
        pending: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setStreaming(true);

      cleanupRef.current?.();
      cleanupRef.current = attachListeners(assistantId) ?? null;

      socket.emit('playground:start', {
        sessionId: sessionId ?? undefined,
        agentId,
        message: text.trim(),
        promptVersionId: promptVersionId || undefined,
        forceFailoverIndex: forceFailover ? 1 : undefined,
      });
    },
    [agentId, attachListeners, canUse, forceFailover, promptVersionId, sessionId, streaming],
  );

  const cancelStream = () => {
    const socket = getAdminSocket();
    if (sessionId && socket) {
      socket.emit('playground:cancel', { sessionId });
    }
    setStreaming(false);
  };

  if (agentQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#39ff14]" />
      </div>
    );
  }

  const agent = agentQuery.data;
  if (!agent) {
    return <p className="text-zinc-500">Агент не найден</p>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/admin/agents" className="text-xs text-zinc-500 hover:text-[#39ff14]">
            ← {ru.agents.title}
          </Link>
          <h1 className="text-xl font-semibold text-white">
            {agent.name} — {ru.playground.title}
          </h1>
          <p className="text-xs font-mono text-zinc-500">{agent.modelId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            className="rounded-lg px-3 py-1.5"
            value={promptVersionId}
            onChange={(e) => setPromptVersionId(e.target.value)}
          >
            <SelectOption value="">{ru.playground.selectVersion} (активная)</SelectOption>
            {agent.promptVersions.map((v) => (
              <SelectOption key={v.id} value={v.id}>
                v{v.version}
                {v.isActive ? ' ★' : ''}
              </SelectOption>
            ))}
          </Select>
          {sessionId && (
            <Button
              variant="ghost"
              className="gap-1 text-zinc-400"
              onClick={() => clearMutation.mutate()}
              disabled={streaming}
            >
              <Trash2 className="h-4 w-4" />
              {ru.playground.clear}
            </Button>
          )}
        </div>
      </div>

      {!wsConnected && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {ru.playground.wsDisconnected}
        </div>
      )}

      {streamError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {streamError}
        </div>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden border-white/10 bg-black/20 p-0 backdrop-blur-md">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-zinc-500 py-12">{ru.playground.empty}</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === 'USER'
                    ? 'bg-[#39ff14]/15 text-white border border-[#39ff14]/20'
                    : 'bg-white/5 text-zinc-100 border border-white/5'
                }`}
              >
                {m.pending && !m.content ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#39ff14]" />
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {usage && (
          <div className="border-t border-white/5 px-4 py-2 text-xs text-zinc-500 flex flex-wrap gap-4">
            <span>
              {ru.playground.tokens}: {usage.totalTokens} (↑{usage.promptTokens} ↓
              {usage.completionTokens})
            </span>
            <span>
              {ru.playground.latency}: {usage.latencyMs} ms
            </span>
            <span>
              {usage.provider} / {usage.model}
            </span>
          </div>
        )}

        <div className="border-t border-white/5 p-4 space-y-2">
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={forceFailover}
              onChange={(e) => setForceFailover(e.target.checked)}
            />
            Force fallback (skip primary model — test mode)
          </label>
          <div className="flex gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
              placeholder={ru.playground.placeholder}
              value={input}
              rows={1}
              disabled={!canUse || streaming || !wsConnected}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
            />
            {streaming ? (
              <Button variant="danger" onClick={cancelStream} className="shrink-0">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => sendMessage(input)}
                disabled={!canUse || !input.trim() || !wsConnected}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
            {!streaming && lastUserMessage && (
              <Button
                variant="secondary"
                onClick={() => sendMessage(lastUserMessage)}
                disabled={!canUse}
                className="shrink-0 text-xs"
              >
                {ru.playground.regenerate}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
