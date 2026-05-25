import { z } from 'zod';

export const OperatorPresenceSchema = z.enum(['ONLINE', 'BUSY', 'AWAY']);
export type OperatorPresence = z.infer<typeof OperatorPresenceSchema>;

export const OperatorSubscribeSchema = z.object({
  workspaceId: z.string().cuid().optional(),
});

export const OperatorTakeoverSchema = z.object({
  conversationId: z.string().cuid(),
});

export const OperatorReleaseSchema = z.object({
  conversationId: z.string().cuid(),
});

export const OperatorEnableCallControlsSchema = z.object({
  conversationId: z.string().cuid(),
  voiceEnabled: z.boolean(),
  videoEnabled: z.boolean(),
});

export const OperatorCallInviteSchema = z.object({
  conversationId: z.string().cuid(),
  visitorSessionId: z.string().cuid(),
  type: z.enum(['VOICE', 'VIDEO']),
});

export const OperatorSendMessageSchema = z.object({
  conversationId: z.string().cuid(),
  content: z.string().min(1).max(8000),
});

export const OperatorFetchConversationSchema = z.object({
  conversationId: z.string().cuid(),
});

export const OperatorTypingSchema = z.object({
  conversationId: z.string().cuid(),
  active: z.boolean(),
});

export const WidgetVisitorTypingSchema = z.object({
  conversationId: z.string().cuid(),
  active: z.boolean(),
});

export const WidgetCallControlsEventSchema = z.object({
  voiceEnabled: z.boolean(),
  videoEnabled: z.boolean(),
  callSessionId: z.string().cuid().optional(),
});

export const WebRtcSignalSchema = z.object({
  callSessionId: z.string().cuid(),
  signalId: z.string().uuid().optional(),
  type: z.enum(['offer', 'answer', 'ice', 'restart']),
  sdp: z.string().optional(),
  candidate: z.unknown().optional(),
});

export const WebRtcCallJoinSchema = z.object({
  callSessionId: z.string().cuid(),
});

export const WidgetCallAcceptSchema = z.object({
  callSessionId: z.string().cuid(),
  audio: z.boolean(),
  video: z.boolean(),
});

export const WebRtcCallRecoverSchema = z.object({
  recoveryToken: z.string().min(16).max(4096),
});

export const WebRtcRecoveryTokenEventSchema = z.object({
  callSessionId: z.string().cuid(),
  recoveryToken: z.string(),
  role: z.enum(['visitor', 'operator']),
});

export const WebRtcCallEndSchema = z.object({
  callSessionId: z.string().cuid(),
  reason: z.enum(['ENDED', 'FAILED']).optional(),
});

export const VisitorHeartbeatSchema = z.object({
  visitorId: z.string().min(8).max(64),
  conversationId: z.string().cuid().optional(),
  currentPage: z.string().max(2048).optional(),
  tabVisible: z.boolean().optional(),
});

export const VISITOR_EVENT_TYPES = [
  'VISITOR_CONNECTED',
  'VISITOR_DISCONNECTED',
  'VISITOR_TYPING',
  'VISITOR_PAGE',
  'ASSISTANT_REPLY',
  'TOOL_EXECUTED',
  'LEAD_CAPTURED',
  'MODEL_FAILOVER',
  'VIDEO_INVITE',
  'VIDEO_ACCEPTED',
  'CALL_STARTED',
  'CALL_ENDED',
  'OPERATOR_JOINED',
  'TAKEOVER_ENABLED',
] as const;

export type VisitorEventType = (typeof VISITOR_EVENT_TYPES)[number];

export interface LiveVisitorDto {
  visitorSessionId: string;
  visitorId: string;
  widgetId: string;
  conversationId: string | null;
  status: 'ONLINE' | 'IDLE' | 'OFFLINE';
  controlMode: 'AI' | 'OPERATOR' | 'HYBRID' | 'RTC_ACTIVE';
  currentPage: string | null;
  reconnectCount: number;
  lastHeartbeatAt: string;
  sessionDurationSec: number;
  country?: string | null;
  deviceSummary?: string | null;
}

export interface RealtimeDiagnosticsDto {
  socketCount: number;
  widgetSockets: number;
  operatorSockets: number;
  adminSockets: number;
  dedupeCacheSize: number;
  activeStreams: number;
  staleSessions: number;
  reconnectRate: number;
  redisAdapter: boolean;
  turnFeatureEnabled: boolean;
}

/**
 * RTCIceServer-compatible entry. STUN servers MUST be sent without credentials
 * and TURN servers MUST have their credentials. Mixing STUN and TURN URLs in a
 * single entry violates the WebRTC spec and causes browsers to silently drop
 * the entire entry — that's why we always emit one entry per protocol.
 */
export interface RtcIceServerDto {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentialsDto {
  /** Pre-built RTCIceServer array — pass directly to RTCPeerConnection. */
  iceServers: RtcIceServerDto[];
  /** Raw username (epoch+ttl) for client-side TTL tracking. */
  username: string;
  /** Raw HMAC-SHA1 credential, base64. */
  credential: string;
  ttlSec: number;
}

export interface ActiveCallDto {
  callSessionId: string;
  visitorSessionId: string;
  operatorId: string | null;
  status: string;
  iceState: string | null;
  reconnectCount: number;
  usingTurn: boolean;
  durationSec: number;
  lastSignalAt: string;
}

export interface RtcDiagnosticsExtendedDto extends RealtimeDiagnosticsDto {
  activeCalls: ActiveCallDto[];
  activeCallCount: number;
  turnHost: string | null;
  signalRelayEnabled: boolean;
}
