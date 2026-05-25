# M11.1 — Operator Dashboard + RTC Runtime Architecture

**Audit date:** 2026-05-21  
**Production:** https://agent.neeklo.ru  
**Server:** root@212.67.9.173  
**Verdict:** **PARTIAL — foundation deployed, end-to-end RTC not production-ready**

---

## Executive Summary

M11.1 established the **architectural foundation** for operator dashboard and RTC runtime. The **blocking widget preview bug is fixed** and deployed. Core packages, API gateways, operator panel scaffold, and signaling skeleton exist.

However, against the **full M11.1 success criteria**, significant gaps remain: **no coturn deployment**, **RTC feature-flagged off**, **no end-to-end call flow** (signaling does not relay SDP/ICE to peer), **incomplete operator dashboard**, **no RTC diagnostics UI**, **no mandatory integration/soak tests**, and **GSTACK formal review artifacts missing**.

| Metric | Value |
|--------|-------|
| **Overall production readiness** | **~58%** |
| **Foundation / architecture** | ~75% |
| **End-to-end RTC calls** | ~15% |
| **Operator dashboard (full spec)** | ~45% |
| **Deploy & infra** | ~70% |

---

## GSTACK Workflow Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| `@gstack-plan-eng-review` | ❌ NOT DONE | No formal plan doc / eng review artifact in repo |
| `@gstack-careful` | ⚠️ PARTIAL | Production-safe patterns used (preview token, locks, feature flags) |
| `@gstack-review` | ⚠️ PARTIAL | This document serves as post-hoc audit; no formal gstack review log |
| NO MOCKS / NO SHORTCUTS | ⚠️ PARTIAL | RTC call accept flow is UI stub; `relaySignal` validates but does not relay |
| Deploy pipeline | ✅ DONE | `./infra/scripts/deploy-production.sh` updated and executed (with recovery) |

---

## Phase-by-Phase Checklist

### FIRST — Widget Preview Fix

| Item | Status | Evidence |
|------|--------|----------|
| Trusted preview origin strategy | ✅ DONE | `WidgetPreviewTokenService`, JWT 15min TTL |
| `previewOriginTrusted=true` | ✅ DONE | Query param + DTO field |
| Admin iframe preview | ✅ DONE | `GET /widgets/:id/preview-session`, widgets-page iframe |
| Operator panel preview origin | ⚠️ N/A | Operator panel uses cookie auth, not widget domain check |
| Local dev preview | ✅ DONE | `localhost`, `127.0.0.1` in trusted list |
| Preview isolated | ✅ DONE | Token bound to widgetId/workspaceId/publicKey/userId |
| No security weakening | ✅ DONE | Public embed still requires domain allowlist |
| No wildcard hacks | ✅ DONE | Explicit hostname set via `WIDGET_TRUSTED_PREVIEW_ORIGINS` |
| No origin spoofing | ✅ DONE | JWT verify + origin hostname check |
| Verify desktop | ✅ DEPLOYED | Manual QA required in admin UI |
| Verify mobile emulation | ⚠️ NOT VERIFIED | No automated/mobile QA record |
| Verify iframe mode | ✅ DONE | Admin uses sandboxed iframe |
| Verify reconnect mode | ⚠️ NOT VERIFIED | No dedicated preview reconnect test |

**Preview fix: ✅ COMPLETE (deployed, `WIDGET_TRUSTED_PREVIEW_ORIGINS` on prod)**

---

### PHASE 1 — RTC Runtime Extraction (`packages/rtc-runtime/`)

| Component | Status | UI-agnostic |
|-----------|--------|-------------|
| PeerConnectionManager | ✅ DONE | Yes |
| MediaSessionManager | ✅ DONE | Yes |
| DevicePermissionManager | ✅ DONE | Yes — requires user gesture |
| IceCandidateQueue | ✅ DONE | Yes |
| RTCReconnectManager | ✅ DONE | Yes |
| RTCDiagnosticsCollector | ✅ DONE | Yes |
| MediaTrackLifecycle | ✅ DONE | Yes |
| FullscreenManager | ✅ DONE | Yes |
| AudioResumeManager | ✅ DONE | Yes |
| No React in core | ✅ DONE | `package.json` has zero runtime deps |
| Not embedded in widget core | ✅ DONE | Lazy import via `widget-call-runtime.ts` |
| Unit tests | ✅ DONE | 4 tests in `rtc-runtime.test.ts` |

**Phase 1: ✅ COMPLETE (library layer)**

---

### PHASE 2 — Operator Panel (`operator-panel.js`)

| Item | Status | Notes |
|------|--------|-------|
| Separate `apps/operator-panel/` | ✅ DONE | |
| `operator-panel.js` loader | ✅ DONE | `loader/loader.ts` → isolated embed |
| Strictly isolated from `widget.js` | ✅ DONE | Separate Vite build + nginx routes |
| Live visitors | ✅ DONE | `operator:subscribe` → list |
| Realtime conversations | ❌ NOT DONE | No conversation transcript view |
| Takeover controls | ✅ DONE | Takeover / Release buttons |
| Voice/video invite controls | ⚠️ PARTIAL | Enable voice/video; no explicit Invite button |
| Diagnostics | ❌ NOT DONE | No ICE/bitrate UI |
| Active calls | ❌ NOT DONE | No call session list |
| Operator presence | ❌ NOT DONE | Schema exists, not wired in UI |
| Live tools stream | ❌ NOT DONE | |
| Live lead events | ❌ NOT DONE | |
| Lazy loaded | ⚠️ PARTIAL | Loader lazy; admin embeds iframe directly |
| WebSocket resilient | ✅ DONE | Infinite reconnect + ping |
| Reconnect safe | ✅ DONE | |
| Mobile safe | ⚠️ PARTIAL | safe-area CSS only |
| Memory safe | ⚠️ PARTIAL | Cleanup in rtc-runtime; panel has no call lifecycle |

**Phase 2: ⚠️ PARTIAL (~40%) — MVP scaffold, not full operator platform**

---

### PHASE 3 — Live Visitor Dashboard

| Field | Status |
|-------|--------|
| Online visitors | ✅ DONE |
| Active page | ✅ DONE |
| Location (country) | ⚠️ PARTIAL | DB field exists, not populated from geo |
| Device/browser | ⚠️ PARTIAL | `deviceSummary` if device JSON present |
| Time on site | ✅ DONE | `sessionDurationSec` |
| Active assistant | ❌ NOT DONE |
| Current conversation | ⚠️ PARTIAL | `conversationId` only, no preview |
| KB usage | ❌ NOT DONE |
| Tool calls | ❌ NOT DONE |
| Failovers | ❌ NOT DONE |
| Connection quality | ❌ NOT DONE |
| Idle status | ✅ DONE | ONLINE/IDLE derived from heartbeat |
| Realtime without refresh | ⚠️ PARTIAL | Updates only on `operator:subscribe` (connect); **no push on visitor heartbeat** |

**Phase 3: ⚠️ PARTIAL (~35%)**

---

### PHASE 4 — Takeover System

| Item | Status |
|------|--------|
| States AI / OPERATOR / HYBRID / RTC_ACTIVE | ✅ DONE | Enum + migration |
| Distributed locking | ✅ DONE | `OperatorSessionLockService`, 30min TTL |
| Operator priority | ⚠️ PARTIAL | First lock wins; no explicit priority queue |
| Stale cleanup | ✅ DONE | `releaseExpired()` on disconnect |
| Conflict prevention | ✅ DONE | `ConflictException` on second operator |
| Takeover history | ❌ NOT DONE | No audit log entries for takeover events |
| Verify two operators cannot control same session | ⚠️ NOT TESTED | Logic exists, no integration test |

**Phase 4: ⚠️ PARTIAL (~70%)**

---

### PHASE 5 — Voice/Video Invite Flow

| Item | Status |
|------|--------|
| Buttons hidden by default | ✅ DONE | Widget shows bar only after `widget:call-controls` |
| Only operator enables | ✅ DONE | `operator:enable-call-controls` |
| Widget receives CALL_CONTROLS | ✅ DONE | `widget:call-controls` event |
| Operator Invite button | ⚠️ PARTIAL | API `operator:call-invite` exists; operator UI has no Invite |
| Widget modal on invite | ✅ DONE | `widget:call-invite` modal |
| User accepts → permissions | ❌ NOT DONE | Accept closes modal only; **no `ensureCallRuntime` / getUserMedia** |
| RTC session initializes | ❌ NOT DONE |
| ICE negotiation | ❌ NOT DONE | `relaySignal` validates only, **does not forward to peer** |
| TURN fallback | ❌ NOT DONE | No coturn |
| Fullscreen support | ❌ NOT DONE | Manager exists, not wired in widget UI |
| Never auto-enable mic/camera | ✅ DONE | `DevicePermissionManager` enforces gesture |

**Phase 5: ❌ NOT DONE (~25%) — signaling skeleton + UI stubs only**

---

### PHASE 6 — Fullscreen + Mobile

| Item | Status |
|------|--------|
| Fullscreen toggle | ⚠️ LIB ONLY | `FullscreenManager.enter/exit` |
| PiP support | ⚠️ LIB ONLY | `togglePiP` |
| Draggable minimized call | ❌ NOT DONE |
| Safe-area support | ⚠️ PARTIAL | CSS in operator panel + manager helper |
| Orientation handling | ❌ NOT DONE |
| Notch support | ⚠️ PARTIAL | safe-area insets only |
| Keyboard avoidance | ❌ NOT DONE |
| iOS Safari fallback | ⚠️ PARTIAL | `isIosSafari`, webkit fullscreen |
| User gesture unlock | ✅ DONE | `AudioResumeManager`, `DevicePermissionManager` |
| Audio resume | ✅ DONE | visibility listener |
| Autoplay-safe strategy | ✅ DONE | AudioContext resume |
| Media recovery after background | ⚠️ PARTIAL | resume hook exists, not E2E tested |

**Phase 6: ⚠️ PARTIAL (~30%) — library primitives, no widget integration**

---

### PHASE 7 — RTC Connection Quality

| Item | Status |
|------|--------|
| RTCDiagnosticsCollector metrics | ✅ DONE | RTT, bitrate, loss, ICE, TURN, codec, fps, resolution |
| Auto-degrade reduce resolution | ⚠️ PARTIAL | Disables video track, no simulcast/layer control |
| Auto-degrade reduce bitrate | ❌ NOT DONE | Detect only, no encoder params |
| Audio-only fallback | ✅ DONE | `shouldDegrade` → disable video tracks |
| ICE restart | ✅ DONE | On disconnect/failed |
| TURN-only retry | ❌ NOT DONE |

**Phase 7: ⚠️ PARTIAL (~50%) — collector + basic degrade in library**

---

### PHASE 8 — TURN Deployment

| Item | Status |
|------|--------|
| turn.neeklo.ru DNS/host | ❌ NOT VERIFIED |
| coturn installed | ❌ NOT DONE | `systemctl is-active coturn` → inactive |
| STUN/TURN UDP/TCP/TLS | ❌ NOT DONE | Script only: `infra/scripts/setup-coturn.sh` |
| Ephemeral credentials | ⚠️ CODE ONLY | `issueTurnCredentials()` in API |
| Relay range / bandwidth | ⚠️ SCRIPT ONLY |
| Cross-platform NAT verify | ❌ NOT DONE |

**Phase 8: ❌ NOT DONE (~10%)**

---

### PHASE 9 — Signaling Safety

| Validation | Status |
|------------|--------|
| workspaceId | ✅ DONE |
| visitorSessionId | ✅ DONE | On call session create |
| operator permissions | ✅ DONE | JWT + MEMBER role on `/operator` |
| call ownership | ✅ DONE | operatorId match on relay |
| stale sessions | ✅ DONE | ENDED status rejected |
| SDP injection protection | ✅ DONE | Size + candidate count limits |
| ICE flood protection | ✅ DONE | 120/10s per call |
| session hijack | ⚠️ PARTIAL | No visitor-side webrtc gateway |
| replay attack | ❌ NOT DONE | No nonce/eventId on signals |
| stale reconnects | ⚠️ PARTIAL | Call session status only |

**Critical gap:** `relaySignal()` returns `{ ok: true }` but **does not emit SDP/ICE to the other peer**.

**Phase 9: ⚠️ PARTIAL (~55%)**

---

### PHASE 10 — Media Cleanup

| On call end | Status |
|-------------|--------|
| stop all tracks | ✅ DONE | `MediaTrackLifecycle`, `MediaSessionManager.destroy` |
| close peer connection | ✅ DONE | `PeerConnectionManager.destroy` |
| remove listeners | ✅ DONE | Null handlers on destroy |
| clear timers | ✅ DONE | Reconnect + diagnostics intervals |
| release devices | ✅ DONE | track.stop() |
| destroy streams | ✅ DONE | |
| clear ICE queues | ✅ DONE | `IceCandidateQueue.reset` |
| Widget disconnect cleanup | ✅ DONE | `destroyCallRuntime()` |
| Verify 100 reconnects / 100 calls | ❌ NOT DONE | No soak tests |
| Tab sleep/wake / mobile background | ❌ NOT DONE | No soak tests |

**Phase 10: ⚠️ PARTIAL (~65%) — code paths exist, not verified under load**

---

### PHASE 11 — Observability (RTC Diagnostics UI)

| Item | Status |
|------|--------|
| Active calls UI | ❌ NOT DONE |
| ICE states UI | ❌ NOT DONE |
| TURN usage UI | ❌ NOT DONE |
| Operator status UI | ❌ NOT DONE |
| Reconnects / failures | ❌ NOT DONE |
| Bitrate / device / duration | ❌ NOT DONE |
| API diagnostics endpoint | ✅ DONE | `GET /realtime/diagnostics` (generic, not RTC-specific) |

**Phase 11: ❌ NOT DONE (~15%)**

---

### PHASE 12 — Mandatory Tests

| Test | Status |
|------|--------|
| reconnect during call | ❌ |
| mobile background | ❌ |
| network switch wifi/lte | ❌ |
| TURN fallback | ❌ |
| ICE restart | ❌ |
| browser refresh | ❌ |
| fullscreen | ❌ |
| PiP | ❌ |
| multiple operators | ❌ |
| stale reconnect | ❌ |
| denied camera/mic | ❌ |
| operator disconnect | ❌ |
| visitor reconnect | ❌ |

**Existing tests:** preview token (3), rtc-runtime unit (4), realtime-runtime (3).  
**Phase 12: ❌ NOT DONE (~5%)**

---

### PHASE 13 — Deploy

| Item | Status |
|------|--------|
| pnpm typecheck | ✅ PASS |
| pnpm test | ✅ PASS |
| pnpm lint | ✅ PASS |
| pnpm build | ✅ PASS |
| deploy-production.sh | ✅ EXECUTED (with manual recovery) |
| pm2 status | ✅ api/web/worker online |
| coturn status | ❌ not installed |
| nginx | ✅ static SPA + widget + operator-panel |
| websocket namespaces | ✅ /widget, /operator, /admin |
| rtc signaling | ❌ FEATURE_RTC_CALLS off, relay incomplete |
| TURN relay | ❌ |
| mobile calls | ❌ |

---

## Architecture

### RTC Runtime (UI-agnostic)

```
Widget (React) ──lazy import──► @botme/rtc-runtime
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            PeerConnection    MediaSession    DevicePermission
            IceQueue          Reconnect       Diagnostics
            Fullscreen        AudioResume     TrackLifecycle
```

### Operator Architecture

```
Admin /admin/operator (iframe)
        │
        ▼
/operator-panel/ (operator-panel.js)
        │  Socket.IO /operator (cookie JWT)
        ▼
OperatorGateway ──► LiveVisitorTracker
                 ──► OperatorSessionLock
                 ──► WidgetSocketBridge ──► WidgetGateway (/widget)
                 ──► WebRtcSignalService (flagged)
```

### Mobile / iOS Safari Strategy (designed, not E2E verified)

1. User gesture required before `getUserMedia`
2. `AudioContext.resume()` on visibility return
3. `webkitRequestFullscreen` fallback
4. `env(safe-area-inset-*)` on operator panel
5. PiP via standard API where supported

### Reconnect Lifecycle

1. Widget/operator WS: Socket.IO infinite reconnect + 25s ping
2. RTC: `RTCReconnectManager` exponential backoff → ICE restart
3. Visitor session: `reconnectCount` in DB, stale cleanup 300s

### Memory / Cleanup Audit

| Subsystem | Cleanup on destroy | Verified under load |
|-----------|-------------------|---------------------|
| RtcRuntime.endCall() | ✅ Full teardown | ❌ |
| Widget socket disconnect | ✅ destroyCallRuntime | ❌ |
| PeerConnectionManager | ✅ close + null handlers | ❌ |
| Operator panel unmount | ✅ socket.disconnect | N/A |

### Security Audit

| Area | Rating | Notes |
|------|--------|-------|
| Widget preview | ✅ STRONG | JWT + trusted origins, no wildcard |
| Public widget domains | ✅ UNCHANGED | |
| Operator WS auth | ✅ GOOD | JWT cookie, role check |
| Takeover locks | ✅ GOOD | DB-backed conflict |
| WebRTC signaling | ⚠️ INCOMPLETE | Validation without relay; visitor gateway missing |
| TURN credentials | ⚠️ N/A | Not deployed |

### Browser Compatibility Matrix

| Platform | Chat/WS | Admin preview | RTC call (when enabled) |
|----------|---------|---------------|-------------------------|
| Chrome desktop | ✅ | ✅ expected | ⚠️ untested |
| Firefox | ✅ | ✅ expected | ⚠️ untested |
| Edge | ✅ | ✅ expected | ⚠️ untested |
| Safari macOS | ✅ | ✅ expected | ⚠️ untested |
| iOS Safari | ✅ | ⚠️ | ❌ not implemented E2E |
| Android Chrome | ✅ | ⚠️ | ❌ not implemented E2E |

### Rollback

1. Revert rsync to previous `apps/api/dist`, `apps/web/dist`, `apps/widget/dist`
2. `pm2 restart ecosystem.config.cjs`
3. Migration `RTC_ACTIVE` is additive — rollback safe
4. Nginx static SPA change — revert `location /` to proxy 4173 if needed

---

## Success Criteria Matrix

| Criterion | Met? |
|-----------|------|
| Live operator takeover | ⚠️ Partial — lock + API, limited UI |
| Stable reconnect | ✅ WS layer yes; RTC untested |
| Fullscreen video | ❌ |
| Mobile calls | ❌ |
| TURN fallback | ❌ |
| Cross-platform RTC | ❌ |
| Safe cleanup | ⚠️ Code yes, soak no |
| No stale sessions | ⚠️ Visitor stale cleanup yes; call sessions partial |
| No ghost calls | ❌ Not verified |
| No duplicated signaling | ⚠️ Dedupe envelope yes; signal relay N/A |
| Stable websocket runtime | ✅ M10.5 foundation |

**Strict M11.1 success: ❌ NOT MET (~4/11 criteria fully met)**

---

## Production State (2026-05-21)

```
API health:     ✅ https://agent.neeklo.ru/api/health
PM2:            ✅ agent-botme-api, web, worker online
Preview env:    ✅ WIDGET_TRUSTED_PREVIEW_ORIGINS set
coturn:         ❌ inactive / not installed
FEATURE_RTC:    ❌ false (not in .env grep — default off)
operator-panel: ✅ https://agent.neeklo.ru/operator-panel/
/admin/operator: ✅ 200 (nginx static SPA)
```

---

## Recommended M11.2 Scope (to reach 90%+)

1. Deploy coturn + `FEATURE_RTC_CALLS=true` in staging
2. Implement bidirectional `webrtc:signal` relay (operator ↔ visitor gateways)
3. Wire widget accept → `ensureCallRuntime` + permissions + fullscreen UI
4. Push `operator:visitors` on heartbeat (realtime dashboard)
5. RTC diagnostics panel + active calls
6. Takeover history via AuditService
7. Mandatory integration test suite (Phase 12 list)
8. Formal GSTACK plan + review artifacts

---

## Files Delivered (M11.1)

| Area | Path |
|------|------|
| Preview token | `apps/api/.../widget-preview-token.service.ts` |
| RTC runtime | `packages/rtc-runtime/src/*` |
| Operator panel | `apps/operator-panel/` |
| Widget call stub | `apps/widget/src/lib/widget-call-runtime.ts` |
| Operator gateway | `apps/api/.../operator.gateway.ts` |
| Signaling | `apps/api/.../webrtc-signal.service.ts` |
| Socket bridge | `apps/api/.../widget-socket-bridge.service.ts` |
| Migration | `20260521180000_m11_1_rtc_active` |
| Coturn script | `infra/scripts/setup-coturn.sh` |
| Nginx | `infra/production/nginx/agent.neeklo.ru.conf` |
| Deploy | `infra/scripts/deploy-production.sh` |
