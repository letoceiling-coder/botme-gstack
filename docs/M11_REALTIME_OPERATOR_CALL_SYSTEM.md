# M11 — Realtime Operator Panel + Voice/Video Call System

**Project:** BOTME  
**Production:** https://agent.neeklo.ru  
**Date:** 2026-05-21  
**Prerequisite:** M10.4 strict audit **PASS** ([M10_4_STRICT_AUDIT.md](./M10_4_STRICT_AUDIT.md))  
**Production readiness:** ~15% (architecture + audit gate complete)

---

## Executive Summary

M11 transforms the widget into a **realtime communication platform** with operator monitoring, AI/operator hybrid takeover, and WebRTC voice/video — while keeping **widget.js** (public) and **operator-panel.js** (admin) strictly separated.

This document defines architecture, phased delivery, and integration with existing BOTME runtime (KB, tools, model failover).

---

## 1. Target Architecture

```
PUBLIC SITE                    ADMIN (agent.neeklo.ru)
     │                                    │
     ▼                                    ▼
 widget.js                         operator-panel.js
 (loader + iframe)                 (standalone embed / admin page)
     │                                    │
     ▼                                    ▼
 /widget WS namespace              /operator WS namespace
 WidgetGateway                    OperatorRealtimeGateway
     │                                    │
     ├──────── WidgetSessionRuntime ──────┤
     │         RealtimePresenceService     │
     │         LiveVisitorTracker          │
     │         Unified Event Bus           │
     │                                    │
     └──────── CallNegotiationService ────┘
                    │
                    ▼
           WebRTCSignalGateway
                    │
         STUN (3478) + TURN TLS (5349)
              turn.neeklo.ru
```

### Separation principle

| Layer | Public | Admin |
|-------|--------|-------|
| Script | `widget.js` | `operator-panel.js` |
| WS namespace | `/widget` | `/operator` |
| Auth | `widgetKey` + domain | JWT + RBAC (OPERATOR+) |
| State | Visitor session only | All visitors + calls |

**Never** inject operator dashboard state into widget bundle.

---

## 2. Core Services (API)

| Service | Responsibility |
|---------|----------------|
| `OperatorRealtimeGateway` | WS auth, subscriptions, event fan-out |
| `WidgetSessionRuntime` | Visitor lifecycle, page/idle tracking |
| `RealtimePresenceService` | Online/offline, typing, operator presence |
| `CallNegotiationService` | Invite → accept/decline → ICE |
| `WebRTCSignalGateway` | SDP/ICE relay, ephemeral TURN creds |
| `OperatorSessionManager` | Operator join, takeover, release |
| `LiveVisitorTracker` | Active visitors index per workspace |

---

## 3. Data Model (planned)

```prisma
model VisitorSession {
  id              String   @id
  workspaceId     String
  widgetId        String
  visitorId       String
  conversationId  String?
  currentPage     String?
  country         String?
  device          Json?
  mode            VisitorControlMode  // AI | OPERATOR | HYBRID
  callState       CallState           // IDLE | INVITED | ACTIVE | ENDED
  voiceEnabled    Boolean  @default(false)
  videoEnabled    Boolean  @default(false)
  lastActivityAt  DateTime
  connectedAt     DateTime
  disconnectedAt  DateTime?
}

model CallSession {
  id              String   @id
  workspaceId     String
  visitorSessionId String
  operatorId      String?
  type            CallType // VOICE | VIDEO
  status          CallStatus
  startedAt       DateTime?
  endedAt         DateTime?
  diagnostics     Json?    // bitrate, packet loss, ICE, TURN
}

model OperatorPresence {
  id           String @id
  workspaceId  String
  userId       String
  status       OperatorStatus // ONLINE | BUSY | AWAY
  lastSeenAt   DateTime
}
```

---

## 4. Unified Event Bus

Event types (shared `@botme/shared/operator.ts`):

| Event | Direction |
|-------|-----------|
| `VISITOR_CONNECTED` | widget → operator |
| `VISITOR_DISCONNECTED` | widget → operator |
| `VISITOR_TYPING` | bidirectional |
| `VISITOR_PAGE` | widget → operator |
| `ASSISTANT_REPLY` | api → operator |
| `TOOL_EXECUTED` | api → operator |
| `LEAD_CAPTURED` | api → operator |
| `MODEL_FAILOVER` | api → operator |
| `VIDEO_INVITE` | operator → widget |
| `VIDEO_ACCEPTED` / `VIDEO_DECLINED` | widget → operator |
| `CALL_STARTED` / `CALL_ENDED` | bidirectional |
| `OPERATOR_JOINED` / `OPERATOR_LEFT` | operator → widget |
| `TAKEOVER_ENABLED` / `TAKEOVER_RELEASED` | operator → api |
| `CALL_SIGNAL` | bidirectional (SDP/ICE) |
| `CALL_CONTROLS` | operator → widget (enable voice/video buttons) |

---

## 5. Operator Takeover Flow

```
1. Visitor chats with AI (mode=AI)
2. Operator monitors via operator-panel.js
3. Operator clicks "Take over" → TAKEOVER_ENABLED
4. API pauses agent stream for conversation; operator messages injected as ASSISTANT
5. Operator clicks "Return to AI" → TAKEOVER_RELEASED
6. AgentModelRuntimeRouter resumes with same fallback chain
```

KB/RAG continues to inject context on next AI turn; operator sees citations panel.

---

## 6. Video/Voice Call Flow

```
Operator: "Invite to video call"
  → VIDEO_INVITE + CALL_CONTROLS { videoEnabled: true }
Widget: modal "Оператор приглашает вас к видеозвонку"
  → Accept → getUserMedia → CALL_SIGNAL (offer)
Operator panel: answer → ICE via WebRTCSignalGateway
TURN: turn.neeklo.ru (coturn, TLS 5349, ephemeral creds)
Call UI: fullscreen, PiP, floating minimize, mobile safe-area
```

Buttons **hidden by default** in widget; only visible after operator remote-enable.

---

## 7. operator-panel.js

Mirror `apps/widget/loader/loader.ts` pattern:

```
apps/operator-panel/
  loader/loader.ts     → operator-panel.js
  src/                 → dashboard UI (separate bundle)
  vite.config.ts       → base /operator-panel/
```

Loaded on admin pages only:

```html
<script src="https://agent.neeklo.ru/operator-panel.js" data-workspace="..."></script>
```

---

## 8. Widget Changes (minimal)

- Hidden call button slots (CSS `display:none` until remote enable)
- Notification center for invites
- `widget:stream-reset` (failover parity with playground)
- Heartbeat + reconnect (existing socket.io)
- Target: **< 150kb gzipped** initial loader

---

## 9. Security

| Control | Implementation |
|---------|----------------|
| WS auth | Widget: publicKey + origin; Operator: JWT |
| TURN | Ephemeral HMAC credentials (coturn `use-auth-secret`) |
| Signaling | Validate workspaceId on every CALL_SIGNAL |
| RBAC | OPERATOR role minimum for takeover/calls |
| Rate limit | Invite spam, signal flood |
| CSP | `media-src`, `connect-src` for turn.neeklo.ru |

---

## 10. Reference Implementation

**neekloai.ru** ([https://neekloai.ru/](https://neekloai.ru/)) — Messager project on `root@89.169.39.244` has proven voice/video across devices.

**Status:** SSH key for `89.169.39.244` not configured on this environment — need key access to port WebRTC patterns.

**Action:** Provide SSH key or copy Messager RTC modules into BOTME manually.

---

## 11. Phased Delivery

| Phase | Scope | Est. |
|-------|-------|------|
| M11.1 | Event bus + visitor tracking + operator WS gateway | 1 sprint |
| M11.2 | operator-panel.js scaffold + live visitor dashboard | 1 sprint |
| M11.3 | Operator takeover (AI/Operator/Hybrid) | 1 sprint |
| M11.4 | coturn on turn.neeklo.ru + signaling | 1 sprint |
| M11.5 | Voice/video UI + invite flow | 1 sprint |
| M11.6 | RTC hardening + mobile + diagnostics | 1 sprint |
| M11.7 | Load test + production E2E | 0.5 sprint |

---

## 12. Compatibility with M10.x

| Feature | M11 impact |
|---------|------------|
| Model failover | Events forwarded to operator; no change to router |
| KB/RAG | Unchanged; operator sees retrieval diagnostics |
| Widget chat | Extended, not replaced |
| Root OpenRouter KB | Unchanged |

---

## 13. Rollback Plan

1. Disable `/operator` WS namespace in nginx
2. Remove operator-panel.js from admin layout
3. Widget reverts to chat-only (call UI dormant)
4. Drop new tables if needed (visitor_sessions, call_sessions)

---

## 14. Readiness

| Area | % |
|------|---|
| M10.4 audit gate | 100% |
| Architecture design | 90% |
| DB schema | 0% |
| Operator gateway | 0% |
| operator-panel.js | 0% |
| WebRTC / TURN | 0% |
| Operator dashboard UI | 0% |
| Tests | 0% |

**Overall M11: ~15%**

---

## 15. Next Steps

1. Add SSH access to `89.169.39.244` for Messager RTC reference audit
2. Implement M11.1: Prisma models + `OperatorRealtimeGateway` + event types in `@botme/shared`
3. Scaffold `apps/operator-panel` with loader → `operator-panel.js`
4. Deploy coturn on `turn.neeklo.ru` ([M11_TURN_RTC_INFRASTRUCTURE.md](./M11_TURN_RTC_INFRASTRUCTURE.md))
