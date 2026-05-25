# M2 — AI Integrations Implementation Plan

> **Phase:** PHASE_1_M2_AI_INTEGRATIONS  
> **Prerequisite:** M1 ✅  
> **Out of scope:** M3 agents/playground, M4 assistants, M5 widget chat

---

## Pre-Implementation Analysis

### ai-core (before M2)
- Stub `AiProviderPort`: validateKey + listModels only
- No adapters, no factory, no fetch client

### M1 foundation (ready)
- `AiIntegration` + `AiModelCache` schema migrated
- `IntegrationCredentialsService` — envelope encrypt/decrypt + mask
- `IntegrationRepository` — workspace scoped CRUD partial
- `AuditService` — integration event hooks
- `RolesGuard` + `WorkspaceGuard` global
- RBAC: integrations mutate = ADMIN/OWNER

### Worker (before M2)
- Only `botme.health` queue — no sync job

### Web (before M2)
- `/admin/integrations` → `FeatureEmptyPage`

### Provider APIs
| Provider | Base URL | Models | Chat | Stream |
|----------|----------|--------|------|--------|
| OpenAI | api.openai.com/v1 | GET /models | POST /chat/completions | SSE |
| OpenRouter | openrouter.ai/api/v1 | GET /models | POST /chat/completions | SSE |

Both use Bearer auth. OpenRouter returns pricing + context_length in models list.

---

## M2 Deliverables

### 1. packages/ai-core
- DTOs: ChatRequest, ChatMessage, ChatCompletion, ChatStreamChunk, EmbeddingRequest
- `AiProviderPort` full interface
- `OpenAiAdapter`, `OpenRouterAdapter` (native fetch, abort, retry, timeout)
- `AiProviderFactory` + `UnsupportedProviderError`
- OpenRouter normalizer (free, pricing, capabilities)

### 2. packages/shared
- Zod schemas: CreateIntegration, UpdateIntegration, IntegrationProvider enum

### 3. apps/api — integration module
- `IntegrationService` — CRUD, validate, enqueue sync
- `ModelSyncService` — upsert AiModelCache from adapter listModels
- `IntegrationController` — 7 routes, JWT + RBAC + throttle
- `ModelCacheRepository`

### 4. apps/worker
- Queue `integration.sync-models`
- Processor: decrypt key → adapter → upsert cache → update status

### 5. apps/web
- Replace empty page with integrations dashboard
- Add modal, table, model browser with search + free badge

### 6. Tests
- Unit: adapters (mock fetch), normalizer, factory, mask
- Integration: CRUD, validate, sync, RBAC, tenant isolation
- Provider: `RUN_PROVIDER_TESTS=1` live OpenAI/OpenRouter

---

## Security Checklist
- [x] apiKey only on POST/PATCH body, never in GET response
- [x] maskedKey in all DTOs
- [x] Provider errors sanitized for client
- [x] validate/sync rate limited (10/min)
- [x] Audit on create/update/delete
- [x] Global JWT before RolesGuard (guard order fix)

---

## Execution Order
1. ai-core expansion + build
2. shared schemas
3. API module + wire app.module
4. worker sync job
5. web UI
6. tests + M2_REPORT
