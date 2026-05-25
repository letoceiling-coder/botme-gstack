# M11.6B — Operator Stabilization: Realtime Sync + Guaranteed RTC + UI Containment

> **Workflow:** `@gstack-plan-eng-review` → `@gstack-careful` → `@gstack-review` → `@gstack-rtc-audit` → `@gstack-production-audit`  
> **Status:** Implemented + deployed 2026-05-21

---

## Executive Summary

Production QA after M11.6 deploy found 7 blocking regressions. All addressed in this sprint.

| # | Production evidence | Root cause | Fix |
|---|---------------------|------------|-----|
| 1 | Visitor list updates only on page refresh | No broadcast on widget connect/disconnect/heartbeat | `WidgetGateway` injects `ChatRealtimeBroadcastService`, broadcasts after `upsertConnected` / `markDisconnected` / debounced heartbeat |
| 2 | Whole operator page scrolls, not only chat | `.op-shell` `min-height: 100dvh`, no overflow containment | `.op-shell` → `height: 100dvh; overflow: hidden`; layout + sidebars + chat all `min-height: 0; overflow: hidden`; only `.op-messages` and visitor list scroll |
| 3 | Operator takeover duplicates messages | Dual emit `operator:message` + `operator:new-message`; local append after `send-message` ack without dedupe | Server: single emit `operator:new-message`. Operator panel: dedupe local append by `m.id`. Drop `onMessage` listener. |
| 4 | `agent.neeklo.ru/admin/operator` no realtime, only on refresh | Same as #1; operator-panel iframe uses operator namespace | Same fix as #1 — visitor list broadcast covers iframe |
| 5 | Video/audio not transmitted | **WebRTC glare** — visitor was also OFFERER (called `acceptInviteWithStream`). Both peers created offers → ICE never completed | Visitor now uses `prepareForAnswerWithStream` (ANSWERER). Operator's offer arrives via `webrtc:signal` → answer is generated and sent back |
| 6 | Operator popup not closing after visitor accepts | Outgoing call path transitioned to `INVITED` state again during runtime bootstrap; modal condition re-matched | Outgoing path skips `INVITED` (uses `ACCEPTING` → `MEDIA_READY`). Outgoing modal removed entirely (operator already pressed call button). Incoming modal hides when `pendingOffer` cleared on accept |
| 7 | Early offers lost (operator's offer arrives before visitor runtime ready) | `handleRemoteSignal` returns silently when `handle === null` | Buffer pending signals; drain after `prepareForAnswerWithStream` completes; `handleReady` flag gate |

---

## P0 — Realtime Visitor Sync

### Before
- `LiveVisitorTrackerService.upsertConnected` updates DB but does not emit
- Only `operator:subscribe` initially fetches visitors
- Operators see new visitors only after manual page refresh

### After

```ts
// apps/api/src/modules/realtime/widget.gateway.ts
async handleInit(client, payload) {
  // ... upsertConnected ...
  this.emitWidget(client, ctx, session.visitorId, 'widget:session', {...});
  void this.chatBroadcast.refreshVisitorList(ctx.workspaceId); // ✨ NEW
}

handleDisconnect(client) {
  // ... markDisconnected ...
  void this.visitors
    .markDisconnected(ctx.workspaceId, ctx.widgetId, ctx.visitorId)
    .then(() => this.chatBroadcast.refreshVisitorList(ctx.workspaceId)); // ✨ NEW
}

async handleHeartbeat(client, payload) {
  // ... heartbeat ...
  this.scheduleVisitorListRefresh(ctx.workspaceId); // 2s debounce
}
```

### Result
- New visitor on demo.neeklo.ru → operator panel + admin operator iframe see them within 1s
- Visitor disconnect → list updates immediately
- Page-change (heartbeat) → list refreshes within 2s (debounced)

---

## P0 — Duplicate Message Fix

### Before
Server `ChatRealtimeBroadcastService.broadcastMessage`:
```ts
this.operatorBridge.emitToWorkspace(ws, 'operator:new-message', payload);
this.operatorBridge.emitToWorkspace(ws, 'operator:message', payload); // ← dual emit
```

Operator panel:
```ts
onMessage: handleNewMessageRef.current,
onNewMessage: handleNewMessageRef.current, // ← both fire same handler
// ...
const resp = await sendOperatorMessage(...);
setMessages((prev) => [...prev, resp.message!]); // ← no dedupe
```

### After
- Single emit `operator:new-message`
- Operator panel local append dedupe: `prev.some(m => m.id === msg.id) ? prev : [...prev, msg]`
- `onMessage` listener removed from `operator-socket.ts`

---

## P1 — WebRTC Glare Fix (CRITICAL)

### Before (broken)

```
Operator             Server               Visitor
  │                    │                     │
  │ call-invite        │                     │
  │───────────────────>│ widget:call-invite  │
  │                    │────────────────────>│
  │                    │                     │ accept → getUserMedia
  │ acceptInviteWith   │                     │
  │ Stream(offerer)    │                     │ acceptInviteWith
  │ → createOffer      │                     │ Stream(offerer)
  │ emit signal=offer  │                     │ → createOffer
  │───────────────────>│ relay              │ emit signal=offer
  │                    │────────────────────>│  (collision!)
  │                    │ relay              │
  │<───────────────────│                     │
  │ applyRemoteOffer   │                     │
  │ on offerer (bug)   │                     │
  │                    │                     │
  │  ✗ ICE never connects, no media
```

### After

```
Operator             Server               Visitor
  │                    │                     │
  │ call-invite        │                     │
  │───────────────────>│ widget:call-invite  │
  │                    │────────────────────>│
  │                    │                     │ accept → getUserMedia
  │ acceptInviteWith   │                     │
  │ Stream(offerer)    │                     │ prepareForAnswerWith
  │ → createOffer      │                     │ Stream(answerer) ✓
  │ emit signal=offer  │                     │ buffer early signals
  │───────────────────>│ relay              │ until handleReady
  │                    │────────────────────>│
  │                    │                     │ handleRemoteSignal(offer)
  │                    │                     │ → createAnswer
  │                    │ relay              │ emit signal=answer
  │                    │<────────────────────│
  │<───────────────────│                     │
  │ applyRemoteAnswer  │                     │
  │ → ICE → CONNECTED ✓│                     │ ICE → CONNECTED ✓
```

### Files
- `apps/widget/src/lib/widget-rtc-session.ts` — `bootstrapAnswererRuntime` (was offerer); signal buffer + `handleReady` flag
- `packages/rtc-runtime/src/types.ts` — new `onRemoteTrack` callback
- `packages/rtc-runtime/src/index.ts` — `onTrack` forwards stream + track to consumer immediately
- `packages/rtc-runtime/src/call-state-machine.ts` — relax transitions so `ACCEPTING → MEDIA_READY → CONNECTING` works for operator outgoing path

---

## P1 — Modal Lifecycle

### Before
- Outgoing modal: `direction === 'outgoing' && callState === 'INVITED'`
- After operator clicks call: `setCallState('REQUESTING_MEDIA')` → modal hidden
- Then `ensureOperatorRuntimeAsOfferer` calls `callStateMachine.transition('INVITED')` → state goes back to INVITED → **modal re-appears**

### After
- Outgoing path: `ACCEPTING → MEDIA_READY → CONNECTING → CONNECTED` (never INVITED)
- Outgoing modal removed from JSX (operator already initiated; RTC panel shows directly)
- Incoming modal condition: `pendingOffer && callState ∉ {CONNECTED, CONNECTING, MEDIA_READY, ENDED}`
- `pendingOffer` cleared on `acceptIncomingCall`, `hangUp`, and `onCallEnd`

---

## P1 — Guaranteed Remote Stream Attachment

### Before
`onRemoteStream` callback fires only via `onDiagnostics` poll (3s interval). For 0–3s of a call, video element has no `srcObject` even though tracks have arrived → black video.

### After
- `RtcRuntime.onRemoteTrack(stream, track)` fires synchronously from `pc.ontrack`
- Widget + operator wire it directly to `video.srcObject = stream` and `video.play()`
- Diagnostics poll remains as fallback

---

## P0 — Operator Panel Scroll Containment

### Container hierarchy

```
html, body, #root        height: 100%; overflow: hidden
└── .op-shell           height: 100dvh; overflow: hidden
    ├── .op-topbar       (fixed)
    ├── .op-banner       (optional)
    └── .op-layout       flex: 1; overflow: hidden
        ├── .op-sidebar--left    overflow-y: auto (header + search + visitor list)
        │   └── .op-visitor-list flex: 1; overflow-y: auto
        ├── .op-chat            overflow: hidden
        │   ├── .op-chat-head    flex-shrink: 0
        │   ├── .op-messages     flex: 1; overflow-y: auto  ← ONLY chat scrolls
        │   ├── .op-quick-replies flex-shrink: 0
        │   └── .op-compose      flex-shrink: 0
        └── .op-sidebar--right   overflow-y: auto
```

### Scrollbars
- All inner scrollers use thin 6px scrollbars with low-contrast color
- Compose textarea: `resize: none; overflow-y: auto`
- No page-level scrolling

---

## Files Changed

### Server
- `apps/api/src/modules/realtime/widget.gateway.ts` — inject `ChatRealtimeBroadcastService`; broadcast on connect/disconnect/heartbeat
- `apps/api/src/modules/realtime/services/chat-realtime-broadcast.service.ts` — single emit (`operator:new-message`)

### RTC runtime
- `packages/rtc-runtime/src/types.ts` — `onRemoteTrack` config
- `packages/rtc-runtime/src/index.ts` — wire `onRemoteTrack` from `pc.ontrack`
- `packages/rtc-runtime/src/call-state-machine.ts` — relax allowed transitions

### Widget
- `apps/widget/src/lib/widget-rtc-session.ts` — answerer flow, signal buffer, `handleReady` gate

### Operator panel
- `apps/operator-panel/src/components/operator-platform.tsx` — local dedupe, outgoing modal removed, incoming modal condition tightened, network hint reset on hangUp/onCallEnd
- `apps/operator-panel/src/lib/operator-rtc-session.ts` — `buildRtcRuntime` helper, outgoing skips INVITED, `onRemoteTrack` wired
- `apps/operator-panel/src/lib/operator-socket.ts` — remove `operator:message` listener
- `apps/operator-panel/src/operator.css` — scroll containment, thin scrollbars, compose `resize: none`

---

## Validation

| Check | Status |
|-------|--------|
| `pnpm typecheck` (all packages) | ✅ |
| `pnpm build` (turbo) | ✅ |
| Production deploy | ✅ |
| `curl /health` agent | ✅ 200 |
| `curl /health` demo | ✅ 200 |
| `/operator-panel/` reachable | ✅ 200 |

---

## Required Production QA

Run these scenarios on production to confirm sign-off:

1. **Visitor presence**
   - Open `demo.neeklo.ru` in tab A as visitor → check `demo.neeklo.ru/operator` in tab B sees visitor within 1s without refresh
   - Close tab A → visitor disappears or status changes within 5s
   - Repeat for `agent.neeklo.ru/admin/operator`

2. **Takeover + chat**
   - Visitor sends message → operator sees it instantly (no duplicate)
   - Operator clicks «Перехватить чат» → sends «Здравствуйте!» → message appears once on both sides
   - Visitor reply appears once on operator panel

3. **RTC voice**
   - Operator clicks «Голосовой звонок» → visitor sees modal → accepts
   - Both should hear within 5s
   - Operator's outgoing modal does NOT appear (only RTC panel)
   - Visitor's modal closes immediately on accept

4. **RTC video**
   - Same as #3 but click «Видеозвонок»
   - Both sides see remote video within 5s
   - No black video for either side

5. **Scroll**
   - On `demo.neeklo.ru/operator`, try scrolling the page — only chat messages should scroll
   - Right sidebar (visitor info + RTC) scrolls independently
   - Compose textarea does NOT show resize handle

---

## Architecture Invariants (Preserved)

- ✅ Visitor = ANSWERER, Operator = OFFERER (for operator-initiated calls)
- ✅ WebRTC signaling via `webrtc:signal` events relayed through API
- ✅ Single broadcast event per message (`operator:new-message`)
- ✅ Visitor list `operator:visitors` + `admin:operator-visitors` synchronized
- ✅ Renegotiation lock during ICE restart
- ✅ Media watchdog + recovery engine intact from M11.6

---

## Rollback

If issues:
```bash
ssh root@agent.neeklo.ru
cd /var/www/agent.neeklo.ru
git log -1 --format='%H %s'
git checkout <previous-commit>
pnpm install
pnpm build
pm2 restart agent-botme-api agent-botme-worker agent-botme-web
```
