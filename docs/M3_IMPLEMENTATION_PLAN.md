# M3 — Agents + Playground Implementation Plan

> **Phase:** PHASE_1_M3_AGENTS_PLAYGROUND  
> **Prerequisite:** M2 ✅  
> **Out of scope:** M4 assistants, M5 widget chat, KB/RAG, tool execution

---

## Pre-Implementation Analysis

### ai-core (M2)
- `AiProviderPort`: `chat`, `chatStream`, abort via `signal`
- OpenAI + OpenRouter adapters with real SSE streaming
- `sanitizeProviderError` for safe client messages
- **Missing:** orchestrator, message assembly, stream normalization layer

### Realtime (M1)
- `AdminGateway` `/admin`: JWT auth, workspace rooms, ping/presence
- **Missing:** `playground:*` events, stream registry, disconnect cleanup

### Database (M1 schema)
- `Agent`, `AgentPromptVersion`, `PlaygroundSession` migrated
- `PlaygroundMessageRole` enum exists, no message table
- Agent missing `description` field (M3 requirement)
- PlaygroundSession missing usage aggregates + messages

### M2 patterns to copy
- `IntegrationModule`: controller → service → repository, Zod, `@Roles`, audit
- `IntegrationCredentialsService` + `aiProviderFactory` for provider calls
- `WorkspaceScopedRepository` for tenant isolation

### Frontend (M2)
- `IntegrationsPage`: table, modal, react-query, RBAC UI
- `lib/api.ts`, `lib/socket.ts` — extend for agents + playground
- `/admin/agents` → empty placeholder

### RBAC (`@botme/shared/rbac`)
| Resource | Read | Mutate / Use |
|----------|------|--------------|
| agents | VIEWER+ | MEMBER+ (M3 API: ADMIN+ per spec) |
| playground | — | MEMBER+ |

---

## M3 Deliverables

### 1. Schema migration
- `Agent.description`
- `PlaygroundMessage` model (immutable history)
- `PlaygroundSession`: usage aggregates, `promptVersionId`, `lastProvider`, `lastModel`, `lastLatencyMs`

### 2. packages/shared
- `agents.ts`: Create/Update schemas, DTOs, prompt version DTOs
- `playground.ts`: WS event types, session DTOs
- Export smoke test update

### 3. packages/ai-core/orchestrator
- `ChatOrchestrator`: deterministic flow (no loops)
- `buildMessages`, `streamChat`, usage mapping
- `OrchestratorError` with retryable flag

### 4. apps/api
- `AgentModule`: CRUD + prompt versions + activate
- `PlaygroundModule`: session CRUD, `StreamRegistry`, orchestration wiring
- `AdminGateway`: `playground:start|chunk|done|error|cancel`
- Routes per spec §3

### 5. apps/web
- `/admin/agents` — list, create/edit modal, archive
- `/admin/agents/:id/playground` — streaming chat UI
- Model picker from integration cache

### 6. Tests
- Unit: orchestrator, prompt versioning, stream normalization
- Integration: agent CRUD, activate version, WS stream, cancel, RBAC, isolation

---

## Architecture

```
Playground UI (WS)
  → AdminGateway playground:start
  → PlaygroundStreamService
  → AgentService + IntegrationCredentialsService (decrypt)
  → ChatOrchestrator (@botme/ai-core)
  → AiProviderFactory → adapter.chatStream()
  → playground:chunk / playground:done
  → PlaygroundSession + PlaygroundMessage persist
```

**No LangChain. No agent loops. Single-turn + history context only.**

---

## WS Protocol

| Event | Direction | Payload |
|-------|-----------|---------|
| `playground:start` | client→server | `{ sessionId?, agentId, message, promptVersionId? }` |
| `playground:chunk` | server→client | `{ sessionId, delta, id }` |
| `playground:done` | server→client | `{ sessionId, usage, latencyMs, content }` |
| `playground:error` | server→client | `{ sessionId, message, retryable }` |
| `playground:cancel` | client→server | `{ sessionId }` |

---

## Security Checklist
- [ ] JWT required on WS playground events
- [ ] Workspace isolation on agent/session lookup
- [ ] `@Roles('MEMBER')` on playground
- [ ] `@Roles('ADMIN')` on agent mutations
- [ ] No raw provider errors to client
- [ ] AbortController cleanup on disconnect/cancel
- [ ] Encrypted keys never logged

---

## Execution Order
1. Migration + generate client
2. shared schemas
3. ai-core orchestrator + unit tests
4. API agent module
5. Playground stream + WS gateway
6. Web agents + playground pages
7. Integration tests + M3_REPORT
