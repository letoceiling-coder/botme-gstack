# M5 — Widget Runtime + Realtime Chat Implementation Plan

> **Phase:** PHASE_1_M5_WIDGET_RUNTIME_CHAT  
> **Prerequisite:** M4 ✅  
> **Out of scope:** voice/video, screen share, RAG, KB ingestion, tool execution, browser automation, autonomous agents, multi-agent orchestration

---

## Pre-Implementation Analysis

### M1 Security (ready)
- `WidgetAuthService` resolves `publicKey` → `WidgetInstance` → `assistantId` from DB only
- Domain allowlist via `WidgetDomain` + Origin header
- `WorkspaceScopedRepository` for tenant isolation
- JWT global guard with `@Public()` on health/auth — widget WS is unauthenticated (key-based)

### M2 Integrations (ready)
- Encrypted credentials via `IntegrationCredentialsService`
- Keys decrypted only server-side during stream start
- Never returned to widget client

### M3 Playground Streaming (pattern to reuse)
- `PlaygroundStreamService` + `StreamRegistry` + `ChatOrchestrator`
- Flow: persist user message → stream chunks → persist assistant on done
- `AbortController` per stream; cleanup in `finally`
- Admin disconnect cancels active streams

### M4 Runtime Snapshots (ready)
- `AssistantRuntimeResolver.resolve()` → frozen snapshot + DB row
- Snapshot contains agent model, prompt version, integration metadata, runtime settings, KB/tool bindings
- **No secrets** in snapshot JSON

### Current Widget State (stub)
| Component | Status |
|-----------|--------|
| `loader/loader.ts` | iframe + launcher, duplicate host guard, mobile fullscreen |
| `WidgetGateway` | auth on connect, ping/pong only |
| `WidgetApp` | connect + status stub, no chat |
| `Conversation` / `Message` schema | exists but unused, missing `snapshotId` |

### Gaps to Close in M5
1. Conversation pins `snapshotId` at create/resume
2. Widget chat WS events + streaming
3. `WidgetStreamRegistry` (separate from playground)
4. Visitor identity (localStorage, server-validated)
5. Reconnect resume without duplicate conversations/streams
6. Premium widget chat UI

---

## Target Flow

```
Client site
  → loader.js (iframe sandbox)
  → widget iframe (?widgetKey=)
  → WS connect /widget + widgetKey query
  → WidgetAuthService (domain + isActive checks)
  → widget:init (visitorId?, conversationId?)
      → resolve/resume conversation + pin snapshot
  → widget:message
      → persist user message
      → ChatOrchestrator.streamCompletion (pinned snapshot)
      → widget:chunk / widget:done
  → reconnect: widget:init with same visitorId + conversationId
      → restore history, no new conversation, no duplicate stream
```

---

## Session Architecture

**Conversation MUST pin:**
- `snapshotId` → `AssistantRuntimeSnapshot`
- Provider, model, prompt version (inside snapshot JSON)

During active conversation:
- Assistant/agent/integration changes do **not** affect pinned snapshot
- New conversations get fresh snapshot at init only

---

## Schema Changes

### Conversation (extend)
- `snapshotId` String FK → `AssistantRuntimeSnapshot` (required for new rows)
- `lastMessageAt` DateTime?

### Message (extend)
- `latencyMs` Int?
- `providerMessageId` String?
- `tokenUsage` Json (existing) — structured usage on assistant messages

---

## API Module: `widget-chat`

```
apps/api/src/modules/widget-chat/
  application/widget-chat.service.ts      # init, message, cancel
  application/widget-stream-registry.ts # duplicate/orphan protection
  infrastructure/conversation.repository.ts
  widget-chat.module.ts
```

### WidgetChatService
- `initSession(ctx, input)` — create/resume conversation, pin snapshot
- `startMessage(ctx, input, callbacks)` — persist user → stream → persist assistant
- `cancelStream(conversationId, streamId)`
- `cancelForDisconnect(socketId)`

Uses:
- `AssistantRuntimeResolver` (new conversations only)
- `AssistantRepository.getSnapshotById()` (pinned reads)
- `IntegrationCredentialsService` (decrypt at stream time)
- `chatOrchestrator` from `@botme/ai-core`

### WidgetAuthService (extend)
- Reject inactive assistant (`isActive`, `status`, `deletedAt`)
- Reject inactive widget

---

## WebSocket Events (`packages/shared/src/widget.ts`)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `widget:init` | C→S | Resume/create session |
| `widget:session` | S→C | visitorId, conversationId, messages, UI config |
| `widget:message` | C→S | Send user message |
| `widget:started` | S→C | streamId assigned |
| `widget:chunk` | S→C | streaming delta |
| `widget:done` | S→C | final content + usage |
| `widget:error` | S→C | safe error |
| `widget:cancel` | C→S | abort stream |
| `widget:typing` | S→C | typing indicator start/stop |

**Client MUST NOT send:** `assistantId`, `snapshotId`, `workspaceId`, `agentId`

---

## WidgetStreamRegistry

Separate from playground `StreamRegistry`.

| Protection | Mechanism |
|------------|-----------|
| Duplicate streams | One active stream per `conversationId`; reject or cancel prior |
| Reconnect duplicate | `hasActive(conversationId)` blocks new message until done |
| Orphan AbortControllers | `remove()` in `finally` |
| Socket disconnect | `cancelAllForSocket(socketId)` |
| Race on init | Conversation create in transaction |

---

## Reconnect Strategy

1. Client stores `botme_visitor_{widgetKey}` + `botme_conversation_{widgetKey}` in localStorage
2. On reconnect, emit `widget:init` with both IDs
3. Server validates: conversation belongs to widget + visitor + workspace
4. Return existing messages — **no new conversation**
5. If stream was active on disconnect → aborted, partial assistant message **not** persisted
6. Client restores UI from server history

---

## Token Safety

From pinned snapshot + agent config:
- `maxTokens` — agent output limit
- `maxContextMessages` — trim history before orchestrator
- Stream timeout — 120s AbortSignal
- Abort cleanup in `finally`

---

## Frontend (apps/widget)

Replace stub with:
- Message list + streaming bubble
- Typing indicator (from snapshot setting)
- Reconnect/offline/loading states
- Auto-scroll
- Mobile fullscreen (existing loader)
- Textarea auto-grow
- No admin deps, no animation libs (CSS only)

**Bundle target:** < 180KB gzip

---

## Loader Hardening

- Keep duplicate `#botme-widget-host` guard
- Validate `postMessage` origin on close
- iframe sandbox: `allow-scripts allow-same-origin allow-forms`
- No client-side assistant resolution

---

## Tests

| Type | Coverage |
|------|----------|
| Unit | widget auth (inactive assistant), stream registry, snapshot pinning |
| Integration | init + message + reconnect, duplicate stream rejection, invalid domain, cross-tenant |
| Manual QA | mobile, reconnect, offline, zero console errors |

---

## Execution Order

1. Migration + generate
2. `packages/shared/src/widget.ts`
3. `widget-chat` module + extend gateway/auth
4. Widget UI + loader
5. Tests + `docs/M5_REPORT.md`

---

## Gate

**Do not start:** Phase 2 features (RAG, tools, voice, agents loops)

**Gate:** `@gstack-review` + `@gstack-qa` widget isolation + reconnect tests
