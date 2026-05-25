# M6 Productization Sprint — Implementation Plan

## Priority order (strict)

| # | Track | Status |
|---|-------|--------|
| 1 | Playground runtime fix | ✅ Done |
| 2 | Ollama Neeklo provider | ✅ Done |
| 3 | Assistant test chat | ✅ Done |
| 4 | Tools runtime Phase 3 | ⏳ Pending |
| 5 | KB UX overhaul | ⏳ Pending |
| 6 | Leads productization | ⏳ Pending |
| 7 | RU UX polish / perf / security audit | ⏳ Partial |

---

## 1. Playground runtime fix

### Root cause
Socket.IO client connects to `window.location.origin` (Vite :5173). Engine.io uses path **`/socket.io/`**, not `/admin`. Vite served SPA HTML for `/socket.io` → handshake failed → `connect_error: server error` → `sendMessage()` silently returned when `!socket.connected`.

### Changes
- `apps/web/src/lib/realtime-url.ts` — WS base URL → `http://localhost:3010` in dev
- `apps/web/src/lib/socket.ts` — use realtime URL, cookie auth, connection status helpers
- `apps/web/vite.config.ts` — proxy `/socket.io` to API
- `apps/widget` — same WS URL fix + `/socket.io` proxy
- `admin.gateway.ts` — try/catch on `playground:start`, structured logging
- `playground-stream.service.ts` — provider request/chunk/error logging
- `agent-playground-page.tsx` — WS disconnected banner, stream errors, listener cleanup

### Validation
- Direct API WS + auth token: `playground:started` → stream events (provider error with fake key is expected)
- typecheck ✅, unit tests ✅

---

## 2. Ollama Neeklo

### Architecture
- `OllamaNeekloAdapter` in `@botme/ai-core` (OpenAI-compatible)
- Prisma enum `OLLAMA_NEEKLO` + migration
- `ProviderCredentialsResolver` — token from `OLLAMA_NEEKLO_TOKEN`, base URL from `OLLAMA_NEEKLO_BASE_URL`
- Integration create: no user API key; server encrypts env token at rest
- UI: provider card with **LOCAL** badge, models marked **Бесплатно**

### Env (server only)
```env
OLLAMA_NEEKLO_BASE_URL=https://ollama.neeklo.ru/v1
OLLAMA_NEEKLO_TOKEN=<secret>
```

---

## 3. Assistant test chat

### Route
`/admin/assistants/:id/chat`

### Backend
- `AssistantTestChatModule` — admin test sessions via `Conversation` (`widgetId=null`, `visitorId=admin:{userId}`)
- WS events: `assistant:chat:start|started|chunk|done|error|cancel`
- RAG injection when citations enabled + KB bindings
- REST: `GET/DELETE /assistants/:id/test-chat/session`

### UI
- Streaming chat, citations, runtime sidebar, clear session

---

## 4. Tools runtime (Phase 3) — TODO

- Expand `ToolRegistry` / `ToolExecutor` (9 tools)
- `/admin/tools` — cards, enable/disable, bind, logs, test panel
- HTTP tool SSRF hardening (partial stub exists)

---

## 5. KB overhaul — TODO

- Text editor, file types (docx/csv/xlsx), URL crawl, chunk inspector, retrieval test, pipeline status UI

---

## 6–7. Leads, UX, perf, security — TODO

See M6_REPORT.md remaining gaps.
