import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Network, Send, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AssistantChatSessionDto, AssistantChatUsageDto, CitationDto } from '@botme/shared';
import { hasMinRole } from '@botme/shared';
import { Badge, Button, Card } from '@botme/ui';
import { api } from '@/lib/api';
import { getAdminSocket, isAdminSocketConnected } from '@/lib/socket';
import { ru } from '@/i18n/ru';
import { useAuthStore } from '@/stores/auth';

interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  citations?: CitationDto[];
  pending?: boolean;
}

export function AssistantChatPage() {
  const { id: assistantId } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.session?.workspace.role);
  const canUse = role ? hasMinRole(role, 'MEMBER') : false;
  const queryClient = useQueryClient();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<AssistantChatUsageDto | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(isAdminSocketConnected);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const sessionQuery = useQuery({
    queryKey: ['assistant-chat', assistantId],
    queryFn: () => api.assistants.testChatSession(assistantId!),
    enabled: !!assistantId,
  });

  useEffect(() => {
    if (sessionQuery.data) {
      setConversationId(sessionQuery.data.conversationId);
      setMessages(
        sessionQuery.data.messages
          .filter((m) => m.role !== 'SYSTEM')
          .map((m) => ({
            id: m.id,
            role: m.role as 'USER' | 'ASSISTANT',
            content: m.content,
            citations: m.citations,
          })),
      );
    }
  }, [sessionQuery.data]);

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
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const clearMutation = useMutation({
    mutationFn: () => api.assistants.clearTestChat(assistantId!),
    onSuccess: async () => {
      setMessages([]);
      setConversationId(null);
      setUsage(null);
      await queryClient.invalidateQueries({ queryKey: ['assistant-chat', assistantId] });
    },
  });

  const attachListeners = useCallback(
    (assistantMsgId: string) => {
      const socket = getAdminSocket();
      if (!socket) return;

      const onChunk = (payload: { conversationId: string; delta: string }) => {
        setConversationId(payload.conversationId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + payload.delta } : m,
          ),
        );
      };

      const onDone = (payload: {
        conversationId: string;
        content: string;
        citations: ChatMessage['citations'];
        usage: AssistantChatUsageDto;
      }) => {
        setConversationId(payload.conversationId);
        setUsage(payload.usage);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: payload.content, citations: payload.citations, pending: false }
              : m,
          ),
        );
        setStreaming(false);
        void queryClient.invalidateQueries({ queryKey: ['assistant-chat', assistantId] });
        cleanup();
      };

      const onError = (payload: { message: string }) => {
        setStreamError(payload.message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        setStreaming(false);
        cleanup();
      };

      const onStarted = (payload: { conversationId: string }) => {
        setConversationId(payload.conversationId);
      };

      function cleanup() {
        socket?.off('assistant:chat:chunk', onChunk);
        socket?.off('assistant:chat:done', onDone);
        socket?.off('assistant:chat:error', onError);
        socket?.off('assistant:chat:started', onStarted);
      }

      socket.on('assistant:chat:chunk', onChunk);
      socket.on('assistant:chat:done', onDone);
      socket.on('assistant:chat:error', onError);
      socket.on('assistant:chat:started', onStarted);

      return cleanup;
    },
    [assistantId, queryClient],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!assistantId || !text.trim() || streaming || !canUse) return;
      const socket = getAdminSocket();
      if (!socket?.connected) {
        setStreamError(ru.playground.sendFailed);
        return;
      }

      setStreamError(null);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'USER', content: text.trim() };
      const assistantIdMsg = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantIdMsg,
        role: 'ASSISTANT',
        content: '',
        pending: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setStreaming(true);

      cleanupRef.current?.();
      cleanupRef.current = attachListeners(assistantIdMsg) ?? null;

      socket.emit('assistant:chat:start', {
        assistantId,
        conversationId: conversationId ?? undefined,
        message: text.trim(),
      });
    },
    [assistantId, attachListeners, canUse, conversationId, streaming],
  );

  const cancelStream = () => {
    const socket = getAdminSocket();
    if (conversationId && socket) {
      socket.emit('assistant:chat:cancel', { conversationId });
    }
    setStreaming(false);
  };

  if (sessionQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#39ff14]" />
      </div>
    );
  }

  const session = sessionQuery.data;
  if (!session) {
    return <p className="text-zinc-500">Сессия недоступна</p>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <Link to="/admin/assistants" className="text-xs text-zinc-500 hover:text-[#39ff14]">
            ← {ru.assistants.title}
          </Link>
          <h1 className="text-xl font-semibold text-white">
            {session.runtime.assistantName} — {ru.assistants.testChat}
          </h1>
          <p className="text-xs font-mono text-zinc-500">{session.runtime.modelId}</p>
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
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="py-12 text-center text-sm text-zinc-500">{ru.playground.empty}</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === 'USER'
                      ? 'border border-[#39ff14]/20 bg-[#39ff14]/15 text-white'
                      : 'border border-white/5 bg-white/5 text-zinc-100'
                  }`}
                >
                  {m.pending && !m.content ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#39ff14]" />
                  ) : (
                    <>
                      <span className="whitespace-pre-wrap">{m.content}</span>
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-white/10 pt-2">
                          <p className="text-xs text-zinc-500">Источники:</p>
                          {m.citations.map((c) => (
                            <p key={c.chunkId} className="text-xs text-zinc-400">
                              [{c.score.toFixed(2)}] {c.label || c.filename}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {usage && (
            <div className="flex flex-wrap gap-4 border-t border-white/5 px-4 py-2 text-xs text-zinc-500">
              <span>
                {ru.playground.tokens}: {usage.totalTokens}
              </span>
              <span>
                {ru.playground.latency}: {usage.latencyMs} ms
              </span>
            </div>
          )}

          <div className="border-t border-white/5 p-4">
            <div className="flex gap-2">
              <textarea
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
                placeholder={ru.playground.placeholder}
                value={input}
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
              {conversationId && (
                <Button
                  variant="ghost"
                  onClick={() => clearMutation.mutate()}
                  disabled={streaming}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="w-full shrink-0 border-white/10 bg-black/20 p-4 backdrop-blur-md lg:w-72">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-[#39ff14]">
          <Network className="h-4 w-4" />
          Runtime
        </h3>
        <dl className="space-y-2 text-sm text-zinc-300">
          <div className="flex justify-between">
            <dt>Provider</dt>
            <dd>{session.runtime.provider}</dd>
          </div>
          <div className="flex justify-between">
            <dt>KB</dt>
            <dd>{session.runtime.knowledgeBaseCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tools</dt>
            <dd>{session.runtime.toolCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Snapshot</dt>
            <dd className="truncate font-mono text-xs">{session.snapshotId.slice(0, 8)}…</dd>
          </div>
        </dl>
        <Link
          to={`/admin/assistants/${assistantId}/runtime`}
          className="mt-4 block text-xs text-[#39ff14] hover:underline"
        >
          {ru.assistants.runtimeView} →
        </Link>
      </Card>
    </div>
  );
}
