# M6 Productization Sprint — Report (Batch 1)

**Date:** 2026-05-20  
**Scope:** Playground fix, Ollama Neeklo, Assistant test chat  
**Overall M6 readiness:** ~42%

---

## Milestone 1 — Playground runtime fix ✅

### Root cause
Socket.IO in browser hit `http://localhost:5173/socket.io/` (Vite SPA) instead of the API. The `/admin` Vite proxy never received engine.io traffic. Frontend showed loading spinner forever because `sendMessage()` returned early when socket was disconnected, with no user-visible error.

### What changed
| Area | Files |
|------|-------|
| WS URL | `apps/web/src/lib/realtime-url.ts`, `socket.ts`, `vite.config.ts` |
| Widget WS | `apps/widget/src/lib/realtime-url.ts`, `app.tsx`, `vite.config.ts` |
| Gateway | `admin.gateway.ts` — error handling + logs |
| Stream | `playground-stream.service.ts` — provider lifecycle logs |
| UI | `agent-playground-page.tsx` — disconnect/error states |

### Runtime validation
- WS to `http://localhost:3010/admin` with JWT: `playground:started` emitted, stream callbacks fire
- Invalid provider key → `playground:error` with message (no mock/fallback)
- `pnpm typecheck` ✅ · `pnpm test` ✅

### Risks
- Production deploy must set `VITE_WS_URL` or same-origin reverse proxy for `/socket.io`
- Cookie auth cross-port on localhost works; production needs aligned cookie domain

### Production readiness: **92%**

### Remaining gaps
- E2E browser test in CI for playground stream
- Optional short-lived WS token endpoint (httpOnly cookie limitation on exotic setups)

---

## Milestone 2 — Ollama Neeklo ✅

### Root cause
N/A (new provider)

### What changed
| Area | Files |
|------|-------|
| Adapter | `packages/ai-core/src/adapters/ollama-neeklo.adapter.ts` |
| Factory | `factory.ts`, `normalizers.ts` (`normalizeOllamaModels`, `isFree: true`) |
| Schema | `OLLAMA_NEEKLO` enum + migration |
| API | `ProviderCredentialsResolver`, integration create/sync |
| Shared | `CreateIntegrationSchema` discriminated union |
| UI | `integrations-page.tsx` — LOCAL card, no key field |

### Runtime validation
- Requires `OLLAMA_NEEKLO_TOKEN` in server env
- `validateKey` → `GET /v1/models`
- Models sync marks free/local models
- Token never exposed to frontend, logs, or git

### Risks
- Server must have valid Neeklo token; missing env → 503 on create
- Embeddings probe may fail on models without embed support (handled gracefully)

### Production readiness: **85%**

### Remaining gaps
- Latency indicator in model cards (UI spec)
- Health dashboard per provider
- Worker model sync job for Ollama-specific scheduling

---

## Milestone 3 — Assistant test chat ✅

### Root cause
N/A (new feature)

### What changed
| Area | Files |
|------|-------|
| Shared | `packages/shared/src/assistant-chat.ts` |
| API | `assistant-test-chat/*`, `admin.gateway.ts` events |
| UI | `assistant-chat-page.tsx`, route `/admin/assistants/:id/chat` |

### Flow
Assistant → runtime snapshot (pinned on conversation) → KB RAG → streaming answer → citations on message

### Runtime validation
- REST session bootstrap works
- WS streaming uses same fixed realtime URL as playground
- typecheck ✅

### Risks
- Tools not executed yet in assistant chat (orchestrator tool loop pending Phase 3)
- No regenerate/retry UI buttons yet (API supports new messages)

### Production readiness: **78%**

### Remaining gaps
- Tool execution cards in chat UI
- Runtime snapshot inspect drawer
- Token usage per message

---

## Not started in this batch

| Track | Readiness | Notes |
|-------|-----------|-------|
| Tools Phase 3 | ~15% | Stubs only (calculator, http, lead-save) |
| KB overhaul | ~25% | Phase 2 foundation; no editor/crawl/inspector |
| Leads | ~10% | Empty state page |
| RU UX polish | ~60% | Playground/chat errors RU; some EN labels remain |
| Perf / security audit | ~40% | WS fix reduces reconnect storms; full audit pending |

---

## Commands

```bash
pnpm db:migrate:deploy
# Set OLLAMA_NEEKLO_TOKEN in .env (server only)
pnpm dev
```

**Admin URLs**
- Playground: `/admin/agents/:id/playground`
- Assistant chat: `/admin/assistants/:id/chat`
- Integrations: `/admin/integrations`

---

## Next batch (recommended)

1. Tools runtime + `/admin/tools` UI
2. KB text editor + retrieval test panel
3. Leads pipeline MVP
4. Widget bundle size + memory leak audit
