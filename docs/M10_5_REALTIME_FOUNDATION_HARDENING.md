# M10.5 — Pre-M11 Realtime Foundation Hardening

**Project:** BOTME  
**Production:** https://agent.neeklo.ru  
**Date:** 2026-05-21  
**Prerequisite:** M10.4 strict audit PASS  
**Deploy:** 2026-05-21 — migration applied, API recovered after workspace package symlink fix  
**Production health:** https://agent.neeklo.ru/api/health ✅

---

## Executive Summary

M10.5 hardens the realtime and streaming foundation before M11 voice/video. Introduces centralized `@botme/realtime-runtime` and `@botme/ai-runtime` packages, event envelopes with dedupe, widget state machine, live visitor tracking, operator gateway foundation, WebRTC signaling skeleton (feature-flagged), and stream-reset parity across widget + playground.

**Verdict:** Realtime foundation is production-stable for M11.1 start. Full RTC remains behind `FEATURE_RTC_CALLS=false`.

---

## 1. Architecture Audit

### Before M10.5

| Area | State |
|------|-------|
| Socket.IO Redis adapter | Present but stream state in-memory only |
| Event dedupe | None |
| Widget stream-reset | Missing |
| Operator namespace | None |
| Visitor tracking | None |
| Stream metrics | None |
| Widget state | Scattered booleans |

### After M10.5

```
packages/realtime-runtime/     ← SocketRegistry, EventDeduplicator, DeliveryTracker, HeartbeatManager
packages/ai-runtime/           ← StreamRuntime (abort, reset, metrics)
apps/api/realtime/
  ├── RealtimeRuntimeService
  ├── LiveVisitorTrackerService
  ├── OperatorGateway          (/operator)
  ├── WebRtcSignalService      (feature-flagged)
  ├── OperatorSessionLockService
  └── RealtimeDiagnosticsController
```

---

## 2. Realtime Event Bus (`@botme/realtime-runtime`)

Every emitted WS event via `RealtimeRuntimeService.emit()` includes:

| Field | Purpose |
|-------|---------|
| `eventId` | UUID — dedupe on replay |
| `workspaceId` | Tenant isolation |
| `sessionId` | Visitor / conversation scope |
| `timestamp` | ISO8601 |
| `sequence` | Monotonic per session |
| `source` | widget \| operator \| admin \| api \| system |

**Dedupe:** `EventDeduplicator` — duplicate `eventId` → silently ignored (10k TTL cache).

**Ordering:** `DeliveryTracker` — out-of-order sequences rejected.

**Redis channels** (design, pub/sub ready):

```
botme:workspace:{id}
botme:operator:{id}
botme:widget:{id}
botme:call:{id}
```

Socket.IO Redis adapter already active (`realtime.adapter.ts`).

---

## 3. Streaming Hardening (`@botme/ai-runtime`)

`StreamRuntime` provides:

- `pushChunk()` / `reset()` / `abort()` / `complete()`
- Failover `recordFailover()` → clears ghost chunks
- Metrics: chunkCount, byteCount, resetCount, failoverCount

**Wired paths:**

| Path | stream-reset |
|------|--------------|
| Playground | ✅ `playground:stream-reset` |
| Widget | ✅ `widget:stream-reset` |
| Assistant test | ⚠️ Same tool path — reset via `onStreamReset` hook |

**Rule enforced:** On model failover mid-stream, old buffer cleared before new model chunks emit.

---

## 4. Widget Runtime State Machine

`apps/widget/src/lib/widget-state-machine.ts`:

```
BOOTING → CONNECTING → ONLINE ⇄ STREAMING
              ↓           ↓
         RECONNECTING   OFFLINE → DESTROYED
```

- Replaces boolean chaos (`connection`, `streaming`, etc.)
- `canSendMessage()` only in `ONLINE`
- Client-side `eventId` dedupe (500-entry ring)
- Tab visibility → `widget:heartbeat`
- `widget:stream-reset` handler

---

## 5. Live Visitor Tracking

**Table:** `visitor_sessions` (migration `20260521160000_m10_5_realtime_foundation`)

| Field | Purpose |
|-------|---------|
| status | ONLINE / IDLE / OFFLINE |
| lastHeartbeatAt | Idle detection (120s) |
| reconnectCount | Reconnect tracking |
| tabVisible | Background tab state |
| currentPage | Page tracking |

**Service:** `LiveVisitorTrackerService` — upsert on init, heartbeat, disconnect, list live, cleanup stale (5min).

---

## 6. Operator Foundation

**Namespace:** `/operator` (`WS_NAMESPACES.operator`)

**OperatorGateway:**

- JWT auth (same as admin)
- `operator:subscribe` → live visitors
- `operator:takeover` / `operator:release`
- Distributed lock via `operator_session_locks` (30min TTL, unique per conversation)

**WebRtcSignalService** (skeleton):

- SDP/ICE relay validation
- Ephemeral TURN credentials (HMAC-SHA1)
- **`FEATURE_RTC_CALLS=false`** by default

---

## 7. Database Safety

| Table | Retention strategy |
|-------|-------------------|
| `visitor_sessions` | Stale → OFFLINE after 5min; archive job M11 |
| `call_sessions` | CASCADE on visitor delete |
| `operator_session_locks` | Auto-expire 30min + cleanup on disconnect |

Indexes on `(workspaceId, status, lastHeartbeatAt)`, unique `(workspaceId, widgetId, visitorId)`.

---

## 8. Observability

`GET /realtime/diagnostics` (ADMIN):

- socketCount, widget/operator/admin breakdown
- dedupeCacheSize, activeStreams, staleSessions
- redisAdapter: true
- turnFeatureEnabled: env flag

---

## 9. TURN Preparation

**Script:** `infra/scripts/setup-coturn.sh`  
**Domain:** turn.neeklo.ru (planned on 212.67.9.173)  
**Status:** Script ready; **not deployed publicly** until `FEATURE_RTC_CALLS=true`

---

## 10. Memory & WebSocket Audit

| Check | Result |
|-------|--------|
| Listener cleanup (widget) | ✅ Single mount lifecycle + dedupe |
| Stream registry cleanup | ✅ `finally { remove() }` |
| Health cache cap (M10.4) | ✅ 2000 entries |
| Dedupe cache cap | ✅ 10k entries |
| Stale socket detection | ✅ SocketRegistry + HeartbeatManager |
| Multi-tab admin cancel | ⚠️ Playground still user-scoped (documented) |
| Horizontal scale streams | ⚠️ Stream registries still in-process — Redis locks M11 |

---

## 11. Tests

```
@botme/realtime-runtime: 3 passed (dedupe, sequence, delivery)
@botme/ai-runtime:       3 passed (reset, failover, consume)
@botme/ai-core:          7 passed (failover chain)
@botme/api:              23 passed
@botme/shared:           8 passed (WS_NAMESPACES.operator)
pnpm typecheck:          pass
pnpm build:              pass
```

---

## 12. Production Deploy

```bash
./infra/scripts/deploy-production.sh
```

Post-deploy:

```bash
curl https://agent.neeklo.ru/api/health
curl -H "Cookie: ..." https://agent.neeklo.ru/api/realtime/diagnostics
pm2 status  # api, web, worker online
```

Migration: `20260521160000_m10_5_realtime_foundation`

---

## 13. Rollback

1. Redeploy previous dist artifacts
2. Migration rollback: drop `operator_session_locks`, `call_sessions`, `visitor_sessions` + enums
3. Disable `/operator` namespace (remove OperatorGateway from module)
4. Widget reverts to prior bundle (no envelope meta — backward compatible)

---

## 14. Risks & Gaps

| Risk | Severity | Mitigation |
|------|----------|------------|
| Stream registry not Redis-backed | Medium | Single API instance OK; sticky sessions or Redis M11 |
| Playground cancel by userId not socketId | Low | Multi-tab edge case |
| TURN not live | Low | Feature flag off |
| No E2E browser reconnect test | Medium | Manual + M11 test suite |
| Assistant chat stream-reset UI | Low | Hook wired server-side |

---

## 15. Readiness Score

| Area | % |
|------|---|
| Event bus + dedupe | 90% |
| Redis adapter | 85% |
| Stream hardening | 88% |
| Widget state machine | 85% |
| Visitor tracking | 80% |
| Operator foundation | 75% |
| RTC signaling prep | 40% |
| TURN infra | 20% (script only) |
| E2E tests | 50% |

**Overall M10.5: ~78%** — **M11 may begin** (M11.1 visitor dashboard + operator panel).

---

## 16. Key Files

```
packages/realtime-runtime/
packages/ai-runtime/
packages/database/prisma/migrations/20260521160000_m10_5_realtime_foundation/
apps/api/src/modules/realtime/
apps/widget/src/lib/widget-state-machine.ts
apps/widget/src/app.tsx
packages/shared/src/realtime-envelope.ts
packages/shared/src/operator.ts
infra/scripts/setup-coturn.sh
```
