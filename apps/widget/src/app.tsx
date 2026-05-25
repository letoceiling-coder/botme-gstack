import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  WidgetChunkEvent,
  WidgetDoneEvent,
  WidgetErrorEvent,
  WidgetMessageDto,
  WidgetSessionDto,
  WidgetSessionEvent,
  WidgetStartedEvent,
  WidgetThemeConfig,
  WidgetTypingEvent,
} from '@botme/shared';
import { WS_NAMESPACES } from '@botme/shared';
import { getRealtimeBaseUrl } from './lib/realtime-url';
import { applyWidgetTheme } from './lib/theme';
import { WidgetStateMachine } from './lib/widget-state-machine';
import { getCallControlsFromEvent } from './lib/widget-call-runtime';
import { acceptCallWithStream, destroyCallRuntime, endCall, getRemoteStream, handleRemoteSignal, onPeerReconnected } from './lib/widget-rtc-session';
import { storeCallRecovery, loadCallRecovery, clearCallRecovery } from './lib/call-recovery-storage';
import { scrollMessagesToBottom, bindScrollAnchor } from './lib/widget-scroll';
import { useTextareaAutosize } from './lib/use-textarea-autosize';
import { WidgetMessageBubble } from './components/widget-message-bubble';
import { DENTAL_QUICK_ACTIONS, SendIcon, SparkleAvatar } from './lib/widget-ui';
import './widget.css';

type ConnectionState = 'connecting' | 'online' | 'offline' | 'reconnecting';

interface LocalMessage extends WidgetMessageDto {
  pending?: boolean;
  streaming?: boolean;
}

function storageKey(widgetKey: string, suffix: string) {
  return `botme_${suffix}_${widgetKey}`;
}

function describeMediaError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'Не удалось получить доступ к камере и микрофону';
  const name = (err as { name?: string }).name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Разрешите доступ к камере и микрофону в адресной строке браузера (значок замка слева), затем нажмите «Повторить».';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Камера или микрофон не найдены. Подключите устройство и нажмите «Повторить».';
  }
  if (name === 'NotReadableError') {
    return 'Камера или микрофон заняты другим приложением. Закройте его и нажмите «Повторить».';
  }
  return 'Не удалось получить доступ к камере и микрофону. Проверьте разрешения и нажмите «Повторить».';
}

export function WidgetApp() {
  const widgetKey = new URLSearchParams(window.location.search).get('widgetKey') ?? '';
  const previewToken = new URLSearchParams(window.location.search).get('previewToken') ?? undefined;

  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [session, setSession] = useState<WidgetSessionDto | null>(null);
  const [theme, setTheme] = useState<WidgetThemeConfig | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callControls, setCallControls] = useState<{ voice: boolean; video: boolean } | null>(null);
  const [operatorConnected, setOperatorConnected] = useState(false);
  const [callInvite, setCallInvite] = useState<{ callSessionId: string; inviteType: string } | null>(null);
  const [inCall, setInCall] = useState(false);
  const [callState, setCallState] = useState<string>('IDLE');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<string | null>(null);
  const [networkQualityLevel, setNetworkQualityLevel] = useState<string>('good');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  // Holding the local MediaStream in state ensures the local <video> element
  // is mounted in the DOM (so the ref is non-null) AND we can re-attach
  // srcObject from a useLayoutEffect after React commits the call panel.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const stateMachineRef = useRef(new WidgetStateMachine());
  const seenEventIdsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const streamDeltaBufferRef = useRef('');
  const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callInviteRef = useRef<{ callSessionId: string; inviteType: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const visitorTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useTextareaAutosize(textareaRef, input);

  useEffect(() => {
    if (theme) applyWidgetTheme(theme);
  }, [theme]);

  // Re-attach local/remote streams to the <video> elements every time either
  // the stream or the element changes. The call panel is conditionally
  // mounted, so the refs are null at the moment getUserMedia resolves —
  // we must (re)assign srcObject after the elements appear in the DOM.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      void localVideoRef.current.play().catch(() => undefined);
    }
  }, [localStream, inCall]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, inCall]);

  useEffect(() => {
    callInviteRef.current = callInvite;
  }, [callInvite]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    return bindScrollAnchor(el, (near) => {
      nearBottomRef.current = near;
    });
  }, [session?.conversationId]);

  const scrollIfPinned = useCallback((force = false) => {
    scrollMessagesToBottom(messagesContainerRef.current, force);
  }, []);

  const initSession = useCallback(
    (socket: Socket) => {
      const visitorId = localStorage.getItem(storageKey(widgetKey, 'visitor')) ?? undefined;
      const conversationId = localStorage.getItem(storageKey(widgetKey, 'conversation')) ?? undefined;
      socket.emit('widget:init', { visitorId, conversationId });
    },
    [widgetKey],
  );

  const isDuplicateEvent = useCallback((meta?: { eventId?: string }) => {
    if (!meta?.eventId) return false;
    if (seenEventIdsRef.current.has(meta.eventId)) return true;
    seenEventIdsRef.current.add(meta.eventId);
    if (seenEventIdsRef.current.size > 500) {
      seenEventIdsRef.current.clear();
      seenEventIdsRef.current.add(meta.eventId);
    }
    return false;
  }, []);

  const sessionRef = useRef<WidgetSessionDto | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!widgetKey) {
      setError('Не указан widgetKey');
      setConnection('offline');
      return;
    }

    stateMachineRef.current.transition('CONNECTING');
    const query: Record<string, string> = { widgetKey };
    if (previewToken) query.previewToken = previewToken;
    const socket = io(`${getRealtimeBaseUrl()}${WS_NAMESPACES.widget}`, {
      query,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      stateMachineRef.current.transition('ONLINE');
      setConnection('online');
      setError(null);
      initSession(socket);
      // Recovery requires user gesture — skip auto media on reconnect.
      if (loadCallRecovery() && !activeCallIdRef.current) {
        clearCallRecovery();
      }
    });

    socket.io.on('reconnect_attempt', () => {
      stateMachineRef.current.transition('RECONNECTING');
      setConnection('reconnecting');
    });
    socket.on('disconnect', () => {
      stateMachineRef.current.transition('OFFLINE');
      setConnection('offline');
    });

    socket.on('widget:session', (payload: WidgetSessionEvent & { meta?: { eventId: string } }) => {
      if (isDuplicateEvent(payload.meta)) return;
      const s = payload.session;
      setSession(s);
      setTheme(s.theme);
      localStorage.setItem(storageKey(widgetKey, 'visitor'), s.visitorId);
      localStorage.setItem(storageKey(widgetKey, 'conversation'), s.conversationId);
      setMessages(
        s.messages.length > 0
          ? s.messages
          : s.assistant.welcomeMessage
            ? [{ id: 'welcome', role: 'ASSISTANT', content: s.assistant.welcomeMessage, createdAt: new Date().toISOString() }]
            : [],
      );
      setStreaming(false);
      setTyping(false);
    });

    socket.on('widget:started', (_payload: WidgetStartedEvent) => {
      stateMachineRef.current.transition('STREAMING');
      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          role: 'ASSISTANT',
          content: '',
          createdAt: new Date().toISOString(),
          pending: true,
          streaming: true,
        },
      ]);
    });

    socket.on('widget:stream-reset', () => {
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i]?.streaming) {
            next[i] = { ...next[i]!, content: '' };
            break;
          }
        }
        return next;
      });
    });

    socket.on('widget:chunk', (payload: WidgetChunkEvent) => {
      if (isDuplicateEvent(payload.meta)) return;
      streamDeltaBufferRef.current += payload.delta;
      if (streamFlushTimerRef.current) return;
      streamFlushTimerRef.current = setTimeout(() => {
        const delta = streamDeltaBufferRef.current;
        streamDeltaBufferRef.current = '';
        streamFlushTimerRef.current = null;
        if (!delta) return;
        setMessages((prev) => {
          const next = [...prev];
          let idx = -1;
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]?.streaming) {
              idx = i;
              break;
            }
          }
          if (idx === -1) return prev;
          next[idx] = { ...next[idx]!, content: (next[idx]!.content ?? '') + delta };
          return next;
        });
      }, 48);
    });

    socket.on('widget:done', (payload: WidgetDoneEvent) => {
      stateMachineRef.current.transition('ONLINE');
      setStreaming(false);
      setTyping(false);
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      streamDeltaBufferRef.current = '';
      setMessages((prev) => {
        const withoutPending = prev.filter((m) => !m.streaming);
        return [
          ...withoutPending,
          {
            id: payload.messageId,
            role: 'ASSISTANT',
            content: payload.content,
            createdAt: new Date().toISOString(),
          },
        ];
      });
      requestAnimationFrame(() => scrollIfPinned(true));
    });

    socket.on('widget:error', (payload: WidgetErrorEvent) => {
      stateMachineRef.current.transition('ONLINE');
      setStreaming(false);
      setTyping(false);
      setMessages((prev) => prev.filter((m) => !m.streaming));
      setError(payload.message);
    });

    socket.on('widget:typing', (payload: WidgetTypingEvent) => {
      setTyping(payload.active);
    });

    socket.on(
      'widget:message-ack',
      (payload: { conversationId: string; message: WidgetMessageDto }) => {
        if (sessionRef.current?.conversationId !== payload.conversationId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message.id)) {
            return prev.filter((m) => !(m.id.startsWith('local-') && m.role === 'USER'));
          }
          const localIdx = prev.findIndex((m) => m.id.startsWith('local-') && m.role === 'USER');
          if (localIdx === -1) return [...prev, payload.message];
          const next = [...prev];
          next[localIdx] = payload.message;
          return next;
        });
      },
    );

    socket.on(
      'widget:operator-message',
      (payload: { conversationId: string; message: WidgetMessageDto }) => {
        if (sessionRef.current?.conversationId !== payload.conversationId) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message.id)) return prev;
          return [...prev.filter((m) => !m.streaming), payload.message];
        });
        setOperatorConnected(true);
      },
    );

    socket.on('widget:operator-typing', (payload: { conversationId: string; active: boolean }) => {
      if (sessionRef.current?.conversationId !== payload.conversationId) return;
      setTyping(payload.active);
    });

    socket.on('widget:operator-connected', () => {
      setOperatorConnected(true);
    });

    socket.on('error', (payload: { message?: string }) => {
      setError(payload.message ?? 'Ошибка подключения');
    });

    socket.on(
      'widget:call-controls',
      (payload: { voiceEnabled: boolean; videoEnabled: boolean; callSessionId?: string }) => {
        const controls = getCallControlsFromEvent(payload);
        if (!controls.voiceEnabled && !controls.videoEnabled) {
          setCallControls(null);
          setOperatorConnected(false);
          return;
        }
        setCallControls({ voice: controls.voiceEnabled, video: controls.videoEnabled });
        setOperatorConnected(true);
      },
    );

    socket.on(
      'widget:call-invite',
      (payload: { callSessionId: string; inviteType: string; recoveryToken?: string }) => {
        setCallInvite({ callSessionId: payload.callSessionId, inviteType: payload.inviteType });
        if (payload.recoveryToken) {
          storeCallRecovery({
            callSessionId: payload.callSessionId,
            recoveryToken: payload.recoveryToken,
            inviteType: payload.inviteType,
          });
        }
      },
    );

    socket.on(
      'webrtc:recovery-token',
      (payload: { callSessionId: string; recoveryToken: string; inviteType?: string }) => {
        storeCallRecovery({
          callSessionId: payload.callSessionId,
          recoveryToken: payload.recoveryToken,
          inviteType: payload.inviteType ?? 'VIDEO',
        });
      },
    );

    socket.on('webrtc:peer-reconnected', () => {
      void onPeerReconnected();
    });

    socket.on(
      'webrtc:signal',
      (payload: {
        signalType: 'offer' | 'answer' | 'ice' | 'restart';
        sdp?: string;
        candidate?: RTCIceCandidateInit;
        from?: string;
      }) => {
        void handleRemoteSignal({
          signalType: payload.signalType,
          sdp: payload.sdp,
          candidate: payload.candidate,
        }).then(() => {
          const remote = getRemoteStream();
          if (remote && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remote;
            void remoteVideoRef.current.play().catch(() => undefined);
          }
        });
      },
    );

    socket.on('webrtc:call-end', () => {
      activeCallIdRef.current = null;
      setInCall(false);
      setCallState('ENDED');
      setLocalStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setRemoteStream(null);
      setNetworkQuality(null);
      setRecoveryMessage(null);
      clearCallRecovery();
      destroyCallRuntime();
    });

    const pingTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
        const s = sessionRef.current;
        if (s?.visitorId) {
          socket.emit('widget:heartbeat', {
            visitorId: s.visitorId,
            conversationId: s.conversationId,
            tabVisible: document.visibilityState === 'visible',
            currentPage: typeof window !== 'undefined' ? window.location.href : undefined,
          });
        }
      }
    }, 25_000);

    const onVisibility = () => {
      const s = sessionRef.current;
      if (socket.connected && s?.visitorId) {
        socket.emit('widget:heartbeat', {
          visitorId: s.visitorId,
          conversationId: s.conversationId,
          tabVisible: document.visibilityState === 'visible',
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onOnline = () => {
      if (!socket.connected) socket.connect();
    };
    const onOffline = () => setConnection('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(pingTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      stateMachineRef.current.transition('DESTROYED');
      destroyCallRuntime();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [widgetKey, previewToken, initSession, isDuplicateEvent]);

  const sendMessage = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    const socket = socketRef.current;
    if (!text || !socket || !session || streaming || !stateMachineRef.current.canSendMessage()) return;

    setError(null);
    if (!textOverride) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'USER', content: text, createdAt: new Date().toISOString() },
    ]);
    requestAnimationFrame(() => scrollIfPinned(true));

    socket.emit('widget:message', { conversationId: session.conversationId, content: text });
    socket.emit('widget:visitor-typing', { conversationId: session.conversationId, active: false });
  };

  const sendQuickAction = (label: string) => {
    sendMessage(label);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    const socket = socketRef.current;
    const conversationId = session?.conversationId;
    if (!socket || !conversationId || !e.target.value.trim()) return;
    socket.emit('widget:visitor-typing', { conversationId, active: true });
    if (visitorTypingTimerRef.current) clearTimeout(visitorTypingTimerRef.current);
    visitorTypingTimerRef.current = setTimeout(() => {
      socket.emit('widget:visitor-typing', { conversationId, active: false });
    }, 1200);
  };

  const onAcceptCall = () => {
    const invite = callInviteRef.current;
    if (!invite) return;

    setPermissionDenied(false);
    setError(null);

    const audio = true;
    const wantVideo = invite.inviteType === 'VIDEO';

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Браузер не поддерживает видеозвонки. Используйте Chrome, Firefox или Safari.');
      return;
    }

    // Must be called synchronously from the user click — Safari/iOS otherwise
    // treats the request as non-user-initiated and silently rejects without
    // showing the permission prompt.
    // Audio-only fallback: if the camera is busy (Zoom/Teams) or the device
    // takes >6s to initialise, we silently downgrade to audio-only so the
    // call still goes through. The operator already has the visitor's video,
    // and audio is the most important channel for support.
    const mediaPromise = wantVideo
      ? navigator.mediaDevices.getUserMedia({ audio, video: true }).catch(async (err) => {
          const name = (err as { name?: string }).name ?? '';
          // For real permission errors we re-throw so the user sees the prompt.
          if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') {
            throw err;
          }
          // Otherwise (NotReadableError, OverconstrainedError, AbortError) we fall back.
          return navigator.mediaDevices.getUserMedia({ audio, video: false });
        })
      : navigator.mediaDevices.getUserMedia({ audio, video: false });

    mediaPromise
      .then((stream) => {
        const hasVideo = stream.getVideoTracks().length > 0;
        const video = hasVideo;
        const socket = socketRef.current;
        if (!socket) {
          stream.getTracks().forEach((t) => t.stop());
          return Promise.reject(new Error('offline'));
        }
        setCallInvite(null);
        // Mount the call panel + local <video> immediately. The useEffect
        // bound to `localStream` will hook srcObject as soon as React commits.
        setLocalStream(stream);
        setInCall(true);
        setCallState('REQUESTING_MEDIA');
        socket.emit('widget:call-accept', { callSessionId: invite.callSessionId, audio, video });
        activeCallIdRef.current = invite.callSessionId;
        return acceptCallWithStream(
          {
            socket,
            callSessionId: invite.callSessionId,
            audio,
            video,
            onStateChange: setCallState,
            onRemoteStream: setRemoteStream,
            onError: (m) => setError(m),
            onQualityChange: (level, label) => {
              setNetworkQuality(label);
              setNetworkQualityLevel(level);
            },
            onRecoveryStatus: setRecoveryMessage,
          },
          stream,
        );
      })
      .then((ok) => {
        if (ok === false) {
          activeCallIdRef.current = null;
          setInCall(false);
          setLocalStream(null);
          setRemoteStream(null);
          return;
        }
      })
      .catch((err: unknown) => {
        setPermissionDenied(true);
        const message = describeMediaError(err);
        setError(message);
        setCallInvite(invite);
        setInCall(false);
        setLocalStream(null);
        setRemoteStream(null);
        const socket = socketRef.current;
        if (socket && activeCallIdRef.current) {
          socket.emit('webrtc:call-end', { callSessionId: activeCallIdRef.current, reason: 'PERMISSION_DENIED' });
          activeCallIdRef.current = null;
        }
      });
  };

  const onDeclineCall = () => {
    setCallInvite(null);
  };

  const onHangUp = () => {
    const socket = socketRef.current;
    const callId = activeCallIdRef.current;
    if (socket && callId) endCall(socket, callId);
    activeCallIdRef.current = null;
    setInCall(false);
    setCallState('ENDED');
    setNetworkQuality(null);
    setRecoveryMessage(null);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    clearCallRecovery();
  };

  const title =
    session?.theme?.widgetTitle ??
    (connection === 'online'
      ? session?.assistant.name ?? 'Botme AI'
      : connection === 'reconnecting'
        ? 'Переподключение…'
        : connection === 'connecting'
          ? 'Подключение…'
          : 'Офлайн');

  const assistantName = session?.assistant.name ?? 'AI Assistant';
  const showWelcomeOnly =
    messages.length <= 1 && messages.every((m) => m.role === 'ASSISTANT' && !m.streaming);
  const quickActions = DENTAL_QUICK_ACTIONS;

  return (
    <div className="widget-root">
      <div className="widget-ambient" aria-hidden="true" />

      <header className="widget-header">
        {session?.assistant.avatarUrl ? (
          <img src={session.assistant.avatarUrl} alt="" className="widget-avatar-img" />
        ) : (
          <SparkleAvatar name={assistantName} />
        )}
        <div className="widget-header-main">
          <div className="widget-header-row">
            <span className="widget-title">{title}</span>
            {operatorConnected && <span className="widget-operator-badge">Оператор онлайн</span>}
          </div>
          <div className="widget-subtitle">
            <span className={`widget-online-pulse ${connection === 'online' ? '' : 'offline'}`} />
            <span>
              {connection === 'online'
                ? 'Онлайн • отвечает за ~1s'
                : connection === 'reconnecting'
                  ? 'Переподключение…'
                  : connection === 'connecting'
                    ? 'Подключение…'
                    : 'Офлайн'}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="widget-close"
          aria-label="Закрыть"
          onClick={() => window.parent.postMessage({ type: 'BOTME_CLOSE' }, '*')}
        >
          ×
        </button>
      </header>

      <div className="widget-body">
        <div className="widget-messages" ref={messagesContainerRef}>
          {showWelcomeOnly && session?.assistant.welcomeMessage && (
            <div className="widget-welcome-card">
              <h2>Привет 👋</h2>
              <p>{session.assistant.welcomeMessage}</p>
            </div>
          )}
          {messages.map((m) => (
            <WidgetMessageBubble key={m.id} message={m} />
          ))}
          {typing && !streaming && (
            <div className="bubble assistant typing-dots">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showWelcomeOnly && (
          <div className="widget-quick-actions">
            {quickActions.map((label) => (
              <button
                key={label}
                type="button"
                className="widget-chip"
                disabled={connection !== 'online' || streaming || !session}
                onClick={() => sendQuickAction(label)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="widget-footer">
        <div className="widget-input-shell">
          <div
            className={`widget-rtc-inline ${callControls && (callControls.voice || callControls.video) ? '' : 'hidden'}`}
          >
            {callControls?.voice && (
              <button type="button" className="widget-rtc-btn" aria-label="Голосовой звонок">
                🎤
              </button>
            )}
            {callControls?.video && (
              <button type="button" className="widget-rtc-btn" aria-label="Видеозвонок">
                📹
              </button>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="widget-input"
            rows={1}
            value={input}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder={session?.assistant.placeholder ?? 'Спросите что угодно…'}
            disabled={connection !== 'online' || streaming || !session}
          />
        </div>
        <button
          type="button"
          className="widget-send"
          onClick={() => sendMessage()}
          disabled={connection !== 'online' || streaming || !input.trim() || !session}
          aria-label="Отправить"
        >
          <SendIcon />
        </button>
      </footer>

      <div className="widget-overlay-layer" aria-hidden={!error && !inCall && !callInvite}>
        {error && <div className="widget-error">{error}</div>}

        {inCall && (
          <div className="widget-call-active">
            <div className="widget-call-videos">
              <video ref={remoteVideoRef} className="widget-call-remote" autoPlay playsInline />
              <video ref={localVideoRef} className="widget-call-local" autoPlay playsInline muted />
              {(callState === 'RECONNECTING' || callState === 'ICE_RESTART') && (
                <div className="widget-call-reconnect-overlay">Переподключение…</div>
              )}
            </div>
            <div className="widget-call-badges">
              {recoveryMessage && (
                <span className="widget-call-badge widget-call-badge--recovery">{recoveryMessage}</span>
              )}
              {networkQuality && (
                <span className={`widget-call-badge widget-call-badge--${networkQualityLevel}`}>
                  {networkQuality}
                </span>
              )}
            </div>
            <div className="widget-call-status">
              {callState === 'CONNECTED'
                ? 'Соединение установлено'
                : callState === 'RECONNECTING' || callState === 'ICE_RESTART'
                  ? 'Переподключение…'
                  : callState === 'DEGRADED'
                    ? 'Снижено качество видео'
                    : 'Подключение…'}
            </div>
            <button type="button" className="widget-call-hangup" onClick={onHangUp}>
              Завершить
            </button>
          </div>
        )}

        {callInvite && !inCall && (
          <div className="widget-call-modal" role="dialog" aria-modal="true">
            <p>Оператор приглашает вас на {callInvite.inviteType === 'VIDEO' ? 'видео' : 'голосовой'} звонок</p>
            {permissionDenied && (
              <p className="widget-permission-hint">
                Разрешите доступ к камере и микрофону в адресной строке браузера, затем нажмите «Повторить».
              </p>
            )}
            <div className="widget-call-modal-actions">
              <button type="button" onClick={onDeclineCall}>
                Отклонить
              </button>
              <button type="button" onClick={onAcceptCall}>
                {permissionDenied ? 'Повторить' : 'Принять'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
