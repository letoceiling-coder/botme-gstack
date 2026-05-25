import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { LiveVisitorDto, WidgetMessageDto } from '@botme/shared';
import type { AuthMeResponse } from '../lib/api';
import {
  connectOperatorSocket,
  emitEnableCallControls,
  emitOperatorTyping,
  emitRelease,
  emitTakeover,
  emitCallInvite,
  fetchConversation,
  sendOperatorMessage,
  type OperatorConnectionState,
  type WebRtcSignalEvent,
} from '../lib/operator-socket';
import {
  destroyOperatorRtc,
  endOperatorCall,
  getOperatorCallState,
  getOperatorLocalStream,
  getOperatorRemoteStream,
  getOperatorRtcHandle,
  handleIncomingOfferWithStream,
  handleRemoteSignal,
  joinCallAsOperator,
  startOutgoingCallWithStream,
} from '../lib/operator-rtc-session';
import { storeOperatorRecovery, clearOperatorRecovery } from '../lib/call-recovery-storage';
import { controlModeLabel, formatDuration } from '../lib/operator-labels';
import { opRu } from '../i18n/ru';

type ChatLine = WidgetMessageDto & { system?: boolean; label?: string };

interface ActiveCall {
  callSessionId: string;
  inviteType: 'VOICE' | 'VIDEO';
  direction: 'incoming' | 'outgoing';
}

interface Props {
  session: AuthMeResponse;
}

function connectionLabel(state: OperatorConnectionState): string {
  switch (state) {
    case 'online':
      return opRu.online;
    case 'offline':
      return opRu.offline;
    case 'reconnecting':
      return opRu.reconnecting;
    default:
      return opRu.connecting;
  }
}

export function OperatorPlatform({ session }: Props) {
  const [connection, setConnection] = useState<OperatorConnectionState>('connecting');
  const [visitors, setVisitors] = useState<LiveVisitorDto[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callState, setCallState] = useState('IDLE');
  const [networkHint, setNetworkHint] = useState<string | null>(null);
  const [showRtcOverlay, setShowRtcOverlay] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [unread, setUnread] = useState<Record<string, number>>({});
  const [pendingOffer, setPendingOffer] = useState<{ callSessionId: string; sdp: string; inviteType: 'VOICE' | 'VIDEO' } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selected = useMemo(
    () => visitors.find((v) => v.visitorSessionId === selectedId) ?? null,
    [visitors, selectedId],
  );

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [localStream, activeCall]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, activeCall]);

  useEffect(() => {
    selectedConversationRef.current = selected?.conversationId ?? null;
    if (selected?.conversationId) {
      setUnread((prev) => {
        if (!prev[selected.conversationId!]) return prev;
        const next = { ...prev };
        delete next[selected.conversationId!];
        return next;
      });
    }
  }, [selected?.conversationId]);

  const filteredVisitors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visitors;
    return visitors.filter(
      (v) =>
        v.visitorId.toLowerCase().includes(q) ||
        (v.currentPage ?? '').toLowerCase().includes(q) ||
        (v.deviceSummary ?? '').toLowerCase().includes(q),
    );
  }, [visitors, search]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const appendMessage = useCallback((conversationId: string, message: WidgetMessageDto) => {
    setMessages((prev) => {
      if (selectedConversationRef.current !== conversationId) return prev;
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, []);

  const handleNewMessage = useCallback((payload: { conversationId: string; message: WidgetMessageDto }) => {
    if (payload.conversationId === selectedConversationRef.current) {
      appendMessage(payload.conversationId, payload.message);
      return;
    }
    setUnread((prev) => ({
      ...prev,
      [payload.conversationId]: (prev[payload.conversationId] ?? 0) + 1,
    }));
  }, [appendMessage]);

  const attachStreams = useCallback(() => {
    const local = getOperatorLocalStream();
    const remote = getOperatorRemoteStream();
    if (local && localVideoRef.current && localVideoRef.current.srcObject !== local) {
      localVideoRef.current.srcObject = local;
      void localVideoRef.current.play().catch(() => undefined);
    }
    if (remote && remoteVideoRef.current && remoteVideoRef.current.srcObject !== remote) {
      remoteVideoRef.current.srcObject = remote;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, []);

  const rtcSessionCallbacks = useMemo(
    () => ({
      onStateChange: setCallState,
      onRemoteStream: (stream: MediaStream) => {
        setRemoteStream(stream);
      },
      onQualityChange: (_level: string, label: string) => setNetworkHint(label),
      onRecoveryStatus: (msg: string | null) => {
        if (msg) setNetworkHint(msg);
      },
    }),
    [],
  );

  const loadConversation = useCallback(async (conversationId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    try {
      const data = await fetchConversation(socket, conversationId);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : opRu.offline);
    }
  }, []);

  const onWebRtcSignal = useCallback(
    (payload: WebRtcSignalEvent) => {
      const socket = socketRef.current;
      if (!socket) return;

      if (payload.signalType === 'offer' && payload.sdp) {
        let call = activeCallRef.current;
        if (!call) {
          call = {
            callSessionId: payload.callSessionId,
            inviteType: 'VIDEO',
            direction: 'incoming',
          };
          setActiveCall(call);
          activeCallRef.current = call;
          setPendingOffer({ callSessionId: payload.callSessionId, sdp: payload.sdp, inviteType: 'VIDEO' });
          setCallState('INVITED');
        }
        return;
      }

      const call = activeCallRef.current;
      if (!call) return;

      void handleRemoteSignal({
        signalType: payload.signalType,
        sdp: payload.sdp,
        candidate: payload.candidate,
      }).then(() => {
        attachStreams();
        const remote = getOperatorRemoteStream();
        if (remote) setRemoteStream(remote);
      });
    },
    [attachStreams],
  );

  const handleNewMessageRef = useRef(handleNewMessage);
  handleNewMessageRef.current = handleNewMessage;
  const onWebRtcSignalRef = useRef(onWebRtcSignal);
  onWebRtcSignalRef.current = onWebRtcSignal;
  const attachStreamsRef = useRef(attachStreams);
  attachStreamsRef.current = attachStreams;

  useEffect(() => {
    const handle = connectOperatorSocket({
      onConnection: setConnection,
      onVisitors: setVisitors,
      onEvent: (ev) => {
        if (ev.type === 'TAKEOVER_ENABLED' && ev.conversationId === selectedConversationRef.current) {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              role: 'SYSTEM',
              content: opRu.systemTakeover,
              createdAt: new Date().toISOString(),
              system: true,
            },
          ]);
        }
      },
      onNewMessage: (payload) => handleNewMessageRef.current(payload),
      onVisitorTyping: (payload) => {
        if (payload.conversationId === selectedConversationRef.current) {
          setVisitorTyping(payload.active);
        }
      },
      onError: (m) => setError(m),
      onWebRtcSignal: (payload) => onWebRtcSignalRef.current(payload),
      onCallEnd: () => {
        setActiveCall(null);
        setCallState('ENDED');
        setPendingOffer(null);
        setNetworkHint(null);
        setLocalStream((prev) => {
          prev?.getTracks().forEach((t) => t.stop());
          return null;
        });
        setRemoteStream(null);
        clearOperatorRecovery();
        destroyOperatorRtc();
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      },
      onRecoveryToken: (payload) => {
        storeOperatorRecovery({
          callSessionId: payload.callSessionId,
          recoveryToken: payload.recoveryToken,
          inviteType: payload.inviteType === 'VOICE' ? 'VOICE' : 'VIDEO',
        });
      },
    });
    socketRef.current = handle.socket;

    return () => {
      destroyOperatorRtc();
      handle.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selected?.conversationId) {
      setMessages([]);
      return;
    }
    void loadConversation(selected.conversationId);
  }, [selected?.conversationId, loadConversation]);

  useEffect(() => {
    if (connection !== 'online') return;
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('operator:subscribe', {});
    if (selectedConversationRef.current) {
      void loadConversation(selectedConversationRef.current);
    }
  }, [connection, loadConversation]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, visitorTyping]);

  const socket = socketRef.current;

  const takeover = () => {
    if (!socket || !selected?.conversationId) return;
    emitTakeover(socket, selected.conversationId);
    emitEnableCallControls(socket, selected.conversationId, true, true);
  };

  const release = () => {
    if (!socket || !selected?.conversationId) return;
    emitRelease(socket, selected.conversationId);
    emitEnableCallControls(socket, selected.conversationId, false, false);
  };

  const sendMessage = async () => {
    if (!socket || !selected?.conversationId || !draft.trim()) return;
    const content = draft.trim();
    setDraft('');
    setError(null);
    const resp = await sendOperatorMessage(socket, selected.conversationId, content);
    if (resp.ok && resp.message) {
      const msg = resp.message;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } else {
      setError('Не удалось отправить сообщение');
    }
    emitOperatorTyping(socket, selected.conversationId, false);
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!socket || !selected?.conversationId) return;
    emitOperatorTyping(socket, selected.conversationId, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      emitOperatorTyping(socket, selected.conversationId!, false);
    }, 1200);
  };

  const startCall = (type: 'VOICE' | 'VIDEO') => {
    if (!socket || !selected?.conversationId) return;
    setError(null);
    const conversationId = selected.conversationId;
    const visitorSessionId = selected.visitorSessionId;

    const mediaPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });

    mediaPromise
      .then((stream) => {
        setLocalStream(stream);
        setCallState('REQUESTING_MEDIA');
        return new Promise<{ ok: boolean; callSessionId?: string }>((resolve) => {
          emitCallInvite(socket, conversationId, visitorSessionId, type, resolve);
        }).then((resp) => ({ resp, localStream: stream }));
      })
      .then(({ resp, localStream }) => {
        if (!resp.ok || !resp.callSessionId) {
          localStream.getTracks().forEach((t) => t.stop());
          setError('Не удалось начать звонок');
          return;
        }
        const call: ActiveCall = {
          callSessionId: resp.callSessionId,
          inviteType: type,
          direction: 'outgoing',
        };
        setActiveCall(call);
        activeCallRef.current = call;
        joinCallAsOperator({
          socket,
          callSessionId: resp.callSessionId,
          audio: true,
          video: type === 'VIDEO',
        });
        return startOutgoingCallWithStream(
          {
            socket,
            callSessionId: resp.callSessionId,
            audio: true,
            video: type === 'VIDEO',
            ...rtcSessionCallbacks,
          },
          localStream,
        );
      })
      .then(() => attachStreams())
      .catch(() => setError('Разрешите доступ к камере и микрофону в настройках браузера'));
  };

  const acceptIncomingCall = () => {
    const socket = socketRef.current;
    const call = activeCallRef.current;
    const offer = pendingOffer;
    if (!socket || !call || !offer) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: offer.inviteType === 'VIDEO' })
      .then((stream) => {
        setLocalStream(stream);
        setPendingOffer(null);
        setCallState('REQUESTING_MEDIA');
        return handleIncomingOfferWithStream(
          socket,
          call.callSessionId,
          offer.sdp,
          stream,
          rtcSessionCallbacks,
        );
      })
      .then(attachStreams)
      .catch(() => setError('Разрешите доступ к камере и микрофону в настройках браузера'));
  };

  const hangUp = () => {
    if (!socket || !activeCall) return;
    endOperatorCall(socket, activeCall.callSessionId);
    setActiveCall(null);
    setCallState('ENDED');
    setPendingOffer(null);
    setNetworkHint(null);
    setLocalStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setRemoteStream(null);
    clearOperatorRecovery();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const toggleFullscreen = async () => {
    const handle = getOperatorRtcHandle();
    if (!handle || !remoteContainerRef.current) return;
    if (document.fullscreenElement) {
      await handle.fullscreen.exit();
    } else {
      await handle.fullscreen.enter(remoteContainerRef.current);
    }
  };

  const togglePip = async () => {
    const handle = getOperatorRtcHandle();
    if (!handle || !remoteVideoRef.current) return;
    await handle.fullscreen.togglePiP(remoteVideoRef.current);
  };

  const toggleScreenShare = async () => {
    const handle = getOperatorRtcHandle();
    if (!handle) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const ok = await handle.replaceVideoTrack(track);
      if (!ok) setError('Не удалось включить демонстрацию экрана');
      attachStreams();
    } catch {
      setError('Не удалось включить демонстрацию экрана');
    }
  };

  const messageAuthor = (m: ChatLine): string => {
    if (m.system) return 'Система';
    if (m.author === 'operator') return opRu.authorOperator;
    if (m.author === 'visitor' || m.role === 'USER') return opRu.authorVisitor;
    return opRu.authorAi;
  };

  return (
    <div className="op-shell">
      <header className="op-topbar">
        <div className="op-brand">
          <span className="op-brand-mark" />
          <div>
            <h1>{opRu.title}</h1>
            <p>{session.workspace.name}</p>
          </div>
        </div>
        <div className={`op-pill op-pill--${connection}`}>{connectionLabel(connection)}</div>
      </header>

      {error && <div className="op-banner op-banner--error">{error}</div>}

      <div className="op-layout">
        <aside className="op-sidebar op-sidebar--left">
          <div className="op-sidebar-head">
            <h2>{opRu.conversations}</h2>
            <span className="op-count">{visitors.length}</span>
          </div>
          <input
            className="op-search"
            placeholder={opRu.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {activeCall && (
            <div className="op-active-call-chip">
              {opRu.callActive} · {callState}
            </div>
          )}
          <ul className="op-visitor-list">
            {filteredVisitors.length === 0 && (
              <li className="op-empty">{opRu.noVisitors}</li>
            )}
            {filteredVisitors.map((v) => (
              <li key={v.visitorSessionId}>
                <button
                  type="button"
                  className={`op-visitor-item ${selectedId === v.visitorSessionId ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(v.visitorSessionId)}
                >
                  <div className="op-visitor-row">
                    <strong>{opRu.visitor} {v.visitorId.slice(0, 8)}</strong>
                    <span className="op-visitor-badges">
                      {v.conversationId && unread[v.conversationId] ? (
                        <span className="op-unread">{unread[v.conversationId]}</span>
                      ) : null}
                      <span className={`op-dot op-dot--${v.status.toLowerCase()}`} />
                    </span>
                  </div>
                  <p className="op-visitor-meta">{controlModeLabel(v.controlMode)}</p>
                  <p className="op-visitor-meta">{v.currentPage ?? '—'}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="op-chat">
          {!selected ? (
            <div className="op-chat-empty">{opRu.selectVisitor}</div>
          ) : (
            <>
              <div className="op-chat-head">
                <div>
                  <h2>{opRu.visitor} {selected.visitorId.slice(0, 12)}</h2>
                  <p>{controlModeLabel(selected.controlMode)}</p>
                </div>
                <div className="op-chat-actions">
                  <button type="button" onClick={takeover}>
                    {opRu.takeover}
                  </button>
                  <button type="button" onClick={release}>
                    {opRu.release}
                  </button>
                  <button type="button" disabled={!!activeCall} onClick={() => startCall('VOICE')}>
                    {opRu.callVoice}
                  </button>
                  <button type="button" disabled={!!activeCall} onClick={() => startCall('VIDEO')}>
                    {opRu.callVideo}
                  </button>
                </div>
              </div>

              <div className="op-messages">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`op-msg op-msg--${m.author ?? (m.role === 'USER' ? 'visitor' : 'ai')} ${m.system ? 'op-msg--system' : ''}`}
                  >
                    <div className="op-msg-label">{messageAuthor(m)}</div>
                    <div className="op-msg-body">{m.content}</div>
                  </div>
                ))}
                {visitorTyping && <div className="op-typing">{opRu.typing}</div>}
                <div ref={chatEndRef} />
              </div>

              <div className="op-quick-replies">
                {opRu.quickReplies.map((q) => (
                  <button key={q} type="button" onClick={() => setDraft(q)}>
                    {q}
                  </button>
                ))}
              </div>

              <div className="op-compose">
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder={opRu.sendPlaceholder}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <button type="button" className="op-send" onClick={() => void sendMessage()} disabled={!draft.trim()}>
                  {opRu.send}
                </button>
              </div>
            </>
          )}
        </main>

        <aside className="op-sidebar op-sidebar--right">
          {!selected ? (
            <p className="op-muted">{opRu.selectVisitor}</p>
          ) : (
            <>
              <section className="op-panel">
                <h3>{opRu.visitor}</h3>
                <dl className="op-kv">
                  <dt>{opRu.page}</dt>
                  <dd>{selected.currentPage ?? '—'}</dd>
                  <dt>{opRu.device}</dt>
                  <dd>{selected.deviceSummary ?? '—'}</dd>
                  <dt>{opRu.duration}</dt>
                  <dd>{formatDuration(selected.sessionDurationSec)}</dd>
                  <dt>{opRu.reconnects}</dt>
                  <dd>{selected.reconnectCount}</dd>
                  <dt>{opRu.control}</dt>
                  <dd>{controlModeLabel(selected.controlMode)}</dd>
                </dl>
              </section>

              <section className="op-panel">
                <h3>{opRu.runtimeDiagnostics}</h3>
                <p className="op-muted">{connectionLabel(connection)}</p>
                <p className="op-muted">{opRu.statusOnline}: {selected.status === 'ONLINE' ? opRu.statusOnline : opRu.statusIdle}</p>
              </section>

              {activeCall && (
                <section className="op-panel op-panel--rtc">
                  <h3>{activeCall.direction === 'outgoing' ? opRu.outgoingCall : opRu.incomingCall}</h3>
                  <p>{opRu.callActive}</p>
                  {networkHint && <p className="op-network">{opRu.networkQuality}: {networkHint}</p>}
                  <div className="op-rtc-stage" ref={remoteContainerRef}>
                    <video ref={remoteVideoRef} className="op-rtc-remote" autoPlay playsInline />
                    <video ref={localVideoRef} className="op-rtc-local" autoPlay playsInline muted />
                  </div>
                  <div className="op-rtc-tools">
                    <button type="button" onClick={() => void toggleFullscreen()}>{opRu.fullscreen}</button>
                    <button type="button" onClick={() => void togglePip()}>{opRu.pip}</button>
                    <button type="button" onClick={() => void toggleScreenShare()}>{opRu.screenShare}</button>
                    <button type="button" onClick={() => setShowRtcOverlay((v) => !v)}>{opRu.rtcDiagnostics}</button>
                    <button type="button" className="op-danger" onClick={hangUp}>{opRu.hangUp}</button>
                  </div>
                  {showRtcOverlay && (
                    <div className="op-rtc-overlay">
                      <p>{opRu.rtcDiagnostics}</p>
                      <p>{getOperatorCallState() || callState}</p>
                      {networkHint && <p>{networkHint}</p>}
                    </div>
                  )}
                </section>
              )}

            </>
          )}
        </aside>
      </div>

      {activeCall && activeCall.direction === 'incoming' && pendingOffer && callState !== 'CONNECTED' && callState !== 'CONNECTING' && callState !== 'MEDIA_READY' && callState !== 'ENDED' && (
        <div className="op-modal">
          <div className="op-modal-card">
            <h3>{opRu.incomingCall}</h3>
            <p>{activeCall.inviteType === 'VIDEO' ? opRu.callVideo : opRu.callVoice}</p>
            <div className="op-modal-actions">
              <button type="button" onClick={acceptIncomingCall}>
                {opRu.acceptCall}
              </button>
              <button type="button" className="op-danger" onClick={hangUp}>{opRu.declineCall}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
