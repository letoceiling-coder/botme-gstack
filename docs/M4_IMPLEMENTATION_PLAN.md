# M4 — Assistants + Bindings Implementation Plan

> **Phase:** PHASE_1_M4_ASSISTANTS  
> **Prerequisite:** M3 ✅  
> **Out of scope:** M5 widget runtime/chat, KB ingestion, RAG, tool execution

---

## Pre-Implementation Analysis

### M3 foundation (ready)
- `Agent` + `AgentPromptVersion` + active pointer
- `ChatOrchestrator` — AI runtime path (Agent-owned)
- Playground WS streaming
- `IntegrationCredentialsService` — keys never exposed

### M1 schema (partial)
- `Assistant` exists but minimal (name, agentId, welcomeMessage, behavior JSON)
- `AssistantRuntimeSettings` — widget-oriented fields only
- **No** `KnowledgeBase`, `Tool`, join tables, snapshot model

### Architecture rule
```
Assistant = orchestration / UX / bindings layer
Agent     = AI runtime profile (model, prompt, integration)
```

Assistant **must not** store provider keys, model IDs, or integration configs.

---

## M4 Deliverables

### 1. Schema migration
- Extend `Assistant`: slug, description, placeholder, tone, language, isActive, visibility, createdBy
- Extend `AssistantRuntimeSettings`: maxContextMessages, memoryEnabled, citationsEnabled, moderationEnabled, fallbackMessage, typingSimulation, streamingEnabled
- Stub `KnowledgeBase`, `Tool` (workspace-scoped, name only)
- Join: `AssistantKnowledgeBase`, `AssistantTool`
- `AssistantRuntimeSnapshot` — immutable JSON per resolution (M5 sessions pin this)

### 2. packages/shared
- `assistants.ts` — CRUD schemas, binding schemas, DTOs, `AssistantRuntimeSnapshotDto`

### 3. apps/api — assistant module
- `AssistantService` — CRUD, bindings, validation
- `AssistantRuntimeResolver` — graph resolution → immutable snapshot
- `AssistantController` — 8 routes

### 4. apps/web
- `/admin/assistants` — table + 6-step wizard
- `/admin/assistants/:id/runtime` — inspection page

### 5. Tests
- Unit: resolver, binding validation, snapshot immutability
- Integration: CRUD, bind agent/KB/tool, tenant isolation, reject inactive integration

---

## Runtime Resolution Flow

```
AssistantRuntimeResolver.resolve(assistantId, workspaceId)
  → Assistant + settings
  → Agent (ACTIVE, not deleted)
  → active AgentPromptVersion
  → Integration (ACTIVE, masked name/provider only)
  → KnowledgeBase[] (bound ids)
  → Tool[] (bound ids)
  → Object.freeze(snapshot)
  → persist AssistantRuntimeSnapshot (optional audit)
```

No decrypted keys. No provider secrets in response.

---

## Validation Rules
- Assistant requires agent on create
- Agent must be ACTIVE, same workspace
- Integration must be ACTIVE (via agent)
- KB/Tool bindings same workspace only
- Cross-workspace binding → 403

---

## Execution Order
1. Migration + generate
2. shared schemas
3. API module + resolver
4. Web wizard + runtime page
5. Tests + M4_REPORT
