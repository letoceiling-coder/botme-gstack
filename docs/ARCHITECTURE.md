# Botme — Architecture Plan

> **Status:** Plan review (pre-scaffold)  
> **Workflow:** `/plan-eng-review` Step 0 + full analysis  
> **Locale:** RU-first UI, i18n-ready backend  
> **Principle:** No mock logic, workspace-scoped data only

---

## Step 0 — Scope Challenge

### What already exists

Greenfield repo. No code, no git init. Full freedom on stack choices; zero migration cost.

### Minimum viable platform (Phase 1 — shippable)

To reach production-grade **without boiling the ocean**, Phase 1 delivers end-to-end value:

| In scope Phase 1 | Deferred (architecture-ready) |
|------------------|-------------------------------|
| Auth (email + OAuth later hook) | OAuth providers (Google/GitHub) |
| User + Workspace + RBAC | SSO / SAML |
| AI Integrations: OpenAI + OpenRouter | Anthropic, Gemini, Ollama, etc. (adapter slots) |
| Agents (full runtime profile) | Prompt A/B testing |
| Assistants (agent + KB + tools binding) | Multi-assistant routing |
| KB: text + PDF/TXT/MD upload | URL crawl, DOCX, OCR |
| RAG: pgvector + ingestion worker | Qdrant migration path, reranking |
| Tools: RAG Search, Calculator, HTTP, Lead Saver | Email, Calendar, CRM, Browser automation |
| Widget embed + realtime chat | Voice, video, screen share (signaling stubs only) |
| Leads (basic CRM) | Pipeline automation, export |
| Dashboard shell (10 sections, 4 functional) | Full analytics dashboards |
| Docker compose dev/prod | K8s, multi-region |

**Complexity smell:** Full spec touches 50+ tables, 4 deployables, 15+ tool types, WebRTC.  
**Recommendation:** Phase 1 = **one vertical slice** (integration → agent → assistant → widget chat → lead). Expand horizontally per phase.

### Search check [Layer 1]

| Decision | Built-in / boring choice | Why |
|----------|-------------------------|-----|
| Vector DB | **pgvector** in existing Postgres | Already using PostgreSQL; tenant-filtered queries stay small; one ops surface |
| Monorepo | **Turborepo + pnpm** | Industry default for TS monorepos 2025–2026 |
| Realtime | **Socket.io + Redis adapter** | NestJS `@WebSocketGateway` native; horizontal scale proven |
| Queue | **BullMQ + Redis** | Same Redis; NestJS `@nestjs/bullmq` |
| Widget isolation | **iframe + postMessage** | Third-party embed security; CSS/JS isolation; Intercom pattern |
| API key storage | **Envelope encryption (AES-256-GCM)** | DEK per workspace; master key from env/KMS |
| Clean architecture | **NestJS modules + ports/adapters** | Not full hexagonal ceremony; pragmatic clean |

### [EUREKA] pgvector now, abstract vector port

Most SaaS KBs stay **<500K chunks/workspace** for years. pgvector + `workspace_id` B-tree pre-filter → HNSW on subset = sufficient.  
**Abstraction:** `VectorStorePort` interface from day 1. Implement `PgVectorStore`; add `QdrantVectorStore` when p99 search >200ms or >10M total vectors.

---

## 1. System Context

```
                    ┌─────────────────────────────────────────┐
                    │           Botme Cloud (SaaS)            │
                    │  ┌─────────┐  ┌────────┐  ┌──────────┐  │
                    │  │ Admin   │  │ API    │  │ Worker   │  │
                    │  │ (Vite)  │  │ NestJS │  │ BullMQ   │  │
                    │  └────┬────┘  └───┬────┘  └────┬─────┘  │
                    │       │           │            │         │
                    │       └───────────┼────────────┘         │
                    │                   ▼                      │
                    │     PostgreSQL + pgvector + Redis      │
                    │                   + S3                   │
                    └───────────────────┬──────────────────────┘
                                        │ HTTPS / WSS
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
    Customer site                  OpenAI API                  OpenRouter API
    (embed script)                 (provider)                  (provider)
```

### Data hierarchy (enforced at DB + API layer)

```
User
 └── WorkspaceMember (role)
      └── Workspace
           ├── AiIntegration
           ├── Agent (+ PromptVersion)
           ├── KnowledgeBase (+ Documents → Chunks → Embeddings)
           ├── Tool (+ ToolConfig)
           ├── Assistant (= Agent + KB[] + Tool[])
           ├── WidgetInstance (+ DomainAllowlist)
           ├── Conversation (+ Message)
           └── Lead
```

**Iron rule:** Every query includes `workspace_id`. No global shared AI data.

---

## 2. Monorepo Plan

```
botme/
├── apps/
│   ├── web/                 # Admin dashboard (React + Vite + RR7)
│   ├── api/                 # NestJS HTTP + WS gateway
│   ├── worker/              # BullMQ processors (ingestion, embeddings, tools)
│   └── widget/              # Embeddable UI bundle (Preact or React, minimal)
├── packages/
│   ├── database/            # Prisma schema, migrations, client
│   ├── shared/              # Types, Zod schemas, constants, i18n keys
│   ├── ai-core/             # Provider adapters, orchestration, tool runner
│   ├── vector/              # VectorStorePort + pgvector impl
│   ├── crypto/              # Envelope encryption service
│   ├── ui/                  # shadcn/ui + design tokens (dark/neon green)
│   └── eslint-config/       # Shared TS strict config
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
├── docs/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### SSR-ready strategy

| App | SSR | Approach |
|-----|-----|----------|
| `web` (admin) | Ready, not required v1 | React Router 7 framework mode; SPA first, SSR toggle later for SEO/login |
| `widget` | No | Static bundle + iframe; must stay <150KB gzip |
| `api` | N/A | REST + WS |

---

## 3. Clean Architecture (NestJS)

```
apps/api/src/
├── main.ts
├── app.module.ts
├── core/                    # Global filters, guards, interceptors, config
├── modules/
│   └── {feature}/
│       ├── domain/          # Entities, value objects, domain errors
│       ├── application/     # Use cases, ports (interfaces)
│       ├── infrastructure/  # Prisma repos, Redis, S3, external APIs
│       └── presentation/    # Controllers, DTOs, WS gateways
```

**Dependency rule:** `presentation → application → domain`. Infrastructure implements application ports.

Shared orchestration lives in `packages/ai-core` (usable by `api` and `worker`).

---

## 4. Multi-Tenant Strategy

| Layer | Mechanism |
|-------|-----------|
| Identity | JWT access token carries `userId`, active `workspaceId` |
| Authorization | RBAC: `owner`, `admin`, `member`, `viewer` |
| Data isolation | `workspace_id` FK on every tenant table; composite indexes |
| Defense in depth | PostgreSQL RLS policies (Phase 2 hardening) |
| Widget auth | Public `widgetKey` + origin domain check + optional visitor session token |
| Rate limits | Per workspace, per widget, per IP (Redis sliding window) |

No cross-workspace queries. Repository base class enforces `where: { workspaceId }`.

---

## 5. Database Schema Plan

### Core

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String?
  name          String?
  locale        String   @default("ru")
  createdAt     DateTime @default(now())
  memberships   WorkspaceMember[]
}

model Workspace {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  createdAt   DateTime @default(now())
  members     WorkspaceMember[]
  // ... all child relations
}

model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole  // OWNER | ADMIN | MEMBER | VIEWER
  @@unique([workspaceId, userId])
}
```

### AI Integrations

```prisma
enum AiProviderType {
  OPENAI
  OPENROUTER
  ANTHROPIC   // future
  GEMINI
  OLLAMA
  GROQ
  DEEPSEEK
  TOGETHER
  MISTRAL
}

model AiIntegration {
  id              String @id @default(cuid())
  workspaceId     String
  provider        AiProviderType
  name            String
  encryptedSecret Bytes      // envelope encrypted API key
  keyVersion      Int        @default(1)
  isDefault       Boolean    @default(false)
  status          IntegrationStatus  // ACTIVE | INVALID | DISABLED
  lastValidatedAt DateTime?
  health          Json?      // last check result
  @@unique([workspaceId, provider, name])
}

model AiModelCache {
  id              String @id @default(cuid())
  integrationId   String
  externalId      String   // e.g. gpt-4o, openrouter model id
  provider        AiProviderType
  displayName     String
  contextWindow   Int
  promptPrice     Decimal?
  completionPrice Decimal?
  supportsTools   Boolean
  supportsVision  Boolean
  supportsReasoning Boolean
  isFree          Boolean  @default(false)
  syncedAt        DateTime
  @@unique([integrationId, externalId])
}
```

### Agents

```prisma
model Agent {
  id              String @id @default(cuid())
  workspaceId     String
  name            String
  integrationId   String
  modelId         String   // references AiModelCache.externalId
  temperature     Float    @default(0.7)
  maxTokens       Int      @default(4096)
  systemPrompt    String   @db.Text
  reasoningEnabled Boolean @default(false)
  streamingEnabled Boolean @default(true)
  fallbackModelIds String[] // ordered
  contextStrategy  ContextStrategy  // SLIDING | SUMMARIZE
  memoryStrategy   MemoryStrategy   // NONE | SESSION | PERSISTENT
  activePromptVersionId String?
  promptVersions  AgentPromptVersion[]
}

model AgentPromptVersion {
  id        String @id @default(cuid())
  agentId   String
  version   Int
  content   String @db.Text
  createdBy String
  createdAt DateTime @default(now())
}
```

### Knowledge Base

```prisma
model KnowledgeBase {
  id          String @id @default(cuid())
  workspaceId String
  name        String
  embeddingModel String  // e.g. text-embedding-3-small
  chunkSize   Int @default(512)
  chunkOverlap Int @default(64)
  documents   KbDocument[]
}

model KbDocument {
  id          String @id @default(cuid())
  kbId        String
  workspaceId String
  sourceType  DocumentSource  // TEXT | FILE | URL
  title       String
  mimeType    String?
  storageKey  String?   // S3 key
  status      IndexStatus  // PENDING | PROCESSING | INDEXED | ERROR
  errorMessage String?
  chunks      KbChunk[]
}

model KbChunk {
  id          String @id @default(cuid())
  documentId  String
  workspaceId String
  kbId        String
  content     String @db.Text
  metadata    Json     // page, section, title
  tokenCount  Int
  embedding   Unsupported("vector(1536)")?  // pgvector
  @@index([workspaceId, kbId])
}
```

### Tools

```prisma
enum ToolType {
  WEB_SEARCH
  CALCULATOR
  URL_FETCH
  RAG_SEARCH
  LEAD_SAVER
  EMAIL_SENDER
  CALENDAR
  CRM_PUSH
  HTTP_REQUEST
  WEBHOOK
  BROWSER_AUTOMATION
  FILE_PARSER
  PDF_PARSER
  DOCX_PARSER
  OCR
  IMAGE_ANALYSIS
  SPEECH_TO_TEXT
  TEXT_TO_SPEECH
}

model Tool {
  id          String @id @default(cuid())
  workspaceId String
  type        ToolType
  name        String
  config      Json     // tool-specific encrypted/secrets
  enabled     Boolean @default(true)
  rateLimit   Int?     // per minute
  timeoutMs   Int @default(30000)
}

model ToolExecution {
  id            String @id @default(cuid())
  workspaceId   String
  toolId        String
  conversationId String?
  input         Json
  output        Json?
  status        ExecutionStatus
  durationMs    Int
  error         String?
  createdAt     DateTime @default(now())
}
```

### Assistants & Widgets

```prisma
model Assistant {
  id          String @id @default(cuid())
  workspaceId String
  agentId     String
  name        String
  avatarUrl   String?
  welcomeMessage String
  language    String @default("ru")
  tone        String?
  behavior    Json
  theme       Json     // colors, gradient, position
  leadCollection Json?
  escalation  Json?
  knowledgeBases AssistantKnowledgeBase[]
  tools       AssistantTool[]
  widgets     WidgetInstance[]
}

model WidgetInstance {
  id          String @id @default(cuid())
  workspaceId String
  assistantId String
  publicKey   String @unique  // wm_xxx for embed
  name        String
  allowedDomains WidgetDomain[]
  launcherConfig Json
  isActive    Boolean @default(true)
}

model WidgetDomain {
  id         String @id @default(cuid())
  widgetId   String
  domain     String  // example.com
  @@unique([widgetId, domain])
}
```

### Conversations & Leads

```prisma
model Conversation {
  id          String @id @default(cuid())
  workspaceId String
  assistantId String
  widgetId    String?
  visitorId   String   // anonymous fingerprint hash
  status      ConversationStatus
  messages    Message[]
  lead        Lead?
}

model Message {
  id             String @id @default(cuid())
  conversationId String
  workspaceId    String
  role           MessageRole  // USER | ASSISTANT | SYSTEM | TOOL
  content        String @db.Text
  toolCalls      Json?
  tokenUsage     Json?
  createdAt      DateTime @default(now())
}

model Lead {
  id             String @id @default(cuid())
  workspaceId    String
  conversationId String @unique
  assistantId    String
  email          String?
  phone          String?
  name           String?
  metadata       Json
  pipelineStage  String @default("new")
  assignedTo     String?
  tags           LeadTag[]
  notes          LeadNote[]
}
```

### Audit & Analytics

```prisma
model AuditLog {
  id          String @id @default(cuid())
  workspaceId String
  userId      String?
  action      String
  resource    String
  resourceId  String
  metadata    Json
  ip          String?
  createdAt   DateTime @default(now())
}

model AnalyticsEvent {
  id          String @id @default(cuid())
  workspaceId String
  eventType   String
  payload     Json
  createdAt   DateTime @default(now())
  @@index([workspaceId, eventType, createdAt])
}
```

---

## 6. AI Orchestration Plan

```
User message
     │
     ▼
┌─────────────┐     ┌──────────────────┐
│ Assistant   │────▶│ Resolve bindings   │
│ context     │     │ agent, KB, tools   │
└─────────────┘     └─────────┬──────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     ▼                        ▼                        ▼
┌─────────┐            ┌─────────────┐          ┌──────────────┐
│ RAG     │            │ Tool        │          │ Provider     │
│ retrieve│            │ registry    │          │ adapter      │
│ (if KB) │            │ (allowed)   │          │ OpenAI/OR    │
└────┬────┘            └──────┬──────┘          └──────┬───────┘
     │                        │                        │
     └────────────────────────┼────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │ ChatOrchestrator │
                    │ loop: stream →   │
                    │ tool calls →     │
                    │ continue         │
                    └────────┬────────┘
                             ▼
                    Persist messages + usage
```

### Provider adapter interface (`packages/ai-core`)

```typescript
interface AiProviderPort {
  validateKey(credentials: DecryptedCredentials): Promise<HealthResult>;
  listModels(): Promise<ModelDefinition[]>;
  chatStream(request: ChatRequest): AsyncIterable<ChatChunk>;
  embed(texts: string[], model: string): Promise<number[][]>;
}
```

Implementations: `OpenAiAdapter`, `OpenRouterAdapter`. Factory by `AiProviderType`.

**No LangChain** unless tool-calling abstraction becomes unwieldy. Custom loop = full control, smaller bundle, easier debugging.

### Streaming path

1. WS event `chat:message` → API validates widget/session  
2. Orchestrator starts SSE-like stream over WS (`chat:chunk`, `chat:tool_start`, `chat:done`)  
3. Worker NOT in hot path for chat (sync in API with backpressure); worker for heavy tools only

---

## 7. RAG Plan

### Ingestion pipeline (BullMQ)

```
Upload/Create document
        │
        ▼
  [parse job]     ── PDF/TXT/MD parsers (pdf-parse, etc.)
        │
        ▼
  [chunk job]     ── semantic boundaries, overlap, metadata
        │
        ▼
  [embed job]     ── batch embed via integration's embedding model
        │
        ▼
  [index job]     ── upsert pgvector + status=INDEXED
```

### Chunking strategy

- Recursive split by headings → paragraphs → sentences  
- Overlap 64 tokens default  
- Preserve `document.title`, `section`, `page` in metadata  
- Duplicate detection: content hash per workspace+kb  

### Search flow

1. Embed query  
2. `SELECT ... WHERE workspace_id = $1 AND kb_id = ANY($2) ORDER BY embedding <=> $3 LIMIT 20`  
3. Optional rerank (Phase 3: cross-encoder or LLM rerank)  
4. Inject top-k into system context with citations  

### Embeddings abstraction

```typescript
interface EmbeddingPort {
  embed(texts: string[], model: string): Promise<Float32Array[]>;
}
```

Resolved via workspace's default integration or dedicated embedding integration.

---

## 8. Widget Architecture

### Embed flow

```html
<script
  src="https://cdn.botme.ru/widget/v1/loader.js"
  data-widget-key="wm_xxxxxxxx"
  async
></script>
```

**loader.js (~3KB):** creates launcher button + iframe pointing to `https://widget.botme.ru/embed/{key}?origin=...`

### iframe vs Shadow DOM

| | iframe (chosen) | Shadow DOM |
|---|-----------------|------------|
| CSS isolation | Complete | Partial |
| Cookie/session | Isolated | Shared with host |
| Security on 3rd party sites | Strong | Weak |
| Fullscreen mobile | Native API | Custom |

Communication: `postMessage` with typed protocol (`BOTME_OPEN`, `BOTME_RESIZE`, `BOTME_FULLSCREEN`).

### Widget app (`apps/widget`)

- Minimal React/Preact  
- Connects Socket.io to `wss://api.botme.ru/widget`  
- Typing indicator via server events  
- Mobile: launcher → fullscreen iframe (`100dvh`)  
- Theme from assistant config (CSS variables)

### Multi-site

`WidgetDomain` allowlist checked on every WS handshake + REST init.

---

## 9. WebSocket Architecture

```
                    ┌─────────────────┐
                    │  nginx (sticky)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         API instance   API instance   API instance
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    Redis (Socket.io adapter)
                             │
              pub/sub for cross-instance events
```

### Namespaces

| Namespace | Auth | Purpose |
|-----------|------|---------|
| `/admin` | JWT | Dashboard realtime (leads, indexing status) |
| `/widget` | widgetKey + origin | Public chat |

### Events (widget)

- Client → `session:init`, `message:send`, `typing:start`  
- Server → `message:chunk`, `message:complete`, `assistant:typing`, `error`  

### Reliability

- Message idempotency key on send  
- Redis stream backup for offline replay (Phase 2)  
- Heartbeat 25s / timeout 60s  

---

## 10. Voice / Video / Screen Share Architecture (future-ready)

**Phase 1:** DB + WS event stubs only. No WebRTC in v1.

```
┌──────────┐  signaling (Socket.io)  ┌──────────┐
│ Visitor  │◀──────────────────────▶│ API      │
└────┬─────┘                         └────┬─────┘
     │         WebRTC media              │
     └──────────────────────────────────▶│ TURN/SFU │
                                         │ (Livekit │
                                         │  or      │
                                         │  mediasoup)│
```

Recommended SFU: **Livekit** (managed option) or self-hosted **mediasoup**.  
Signaling messages: `rtc:offer`, `rtc:answer`, `rtc:ice`, `rtc:hangup`.  
Operator takeover: escalate conversation to human agent channel.

---

## 11. Security Analysis

| Threat | Mitigation |
|--------|------------|
| API key leak from DB | Envelope encryption; never log decrypted keys |
| Cross-tenant data access | workspace_id enforcement + tests + RLS |
| Widget abuse | Domain allowlist, rate limits, CAPTCHA on abuse |
| Prompt injection via KB | Sanitize retrieved chunks; system prompt hardening |
| Tool sandbox escape | Tool runner with timeout, allowlist URLs, no eval |
| XSS in widget | iframe sandbox attrs; CSP on widget origin |
| CSRF admin | SameSite cookies + CSRF token for mutations |
| File upload malware | MIME sniff, size limits, virus scan hook (Phase 2) |

### Widget iframe sandbox

```html
<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups" ...>
```

---

## 12. Permissions Architecture

```
WorkspaceRole permissions matrix (CASL-style)

            │ CRUD integrations │ agents │ assistants │ KB │ tools │ widgets │ leads │ settings │
────────────┼───────────────────┼────────┼────────────┼────┼───────┼─────────┼───────┼──────────│
OWNER       │ full              │ full   │ full       │ full│ full  │ full    │ full  │ full     │
ADMIN       │ full              │ full   │ full       │ full│ full  │ full    │ full  │ read     │
MEMBER      │ read              │ CRUD   │ CRUD       │ CRUD│ read  │ read    │ CRUD  │ none     │
VIEWER      │ read              │ read   │ read       │ read│ read  │ read    │ read  │ none     │
```

Guards: `WorkspaceGuard`, `RolesGuard`, `@RequirePermission()`.

---

## 13. Queue Architecture

| Queue | Processor | Concurrency |
|-------|-----------|-------------|
| `document.parse` | Extract text | 5 |
| `document.chunk` | Smart chunk | 10 |
| `document.embed` | Batch embed | 3 (API rate aware) |
| `document.index` | pgvector upsert | 10 |
| `tool.execute` | Heavy tools (URL fetch) | 5 |
| `integration.sync-models` | Model list refresh | 2 |
| `analytics.aggregate` | Rollups | 1 |

Dead letter queue + retry with exponential backoff (3 attempts).

Outbox pattern for: message persisted → WS emit (transactional outbox table).

---

## 14. Upload Pipeline

```
Client → presigned S3 URL (api)
      → direct upload to S3
      → callback/webhook → enqueue parse job
      → status via WS to admin UI
```

Limits: 25MB/file Phase 1; MIME allowlist `pdf, txt, md, csv`.

---

## 15. Scaling Strategy

| Stage | Architecture |
|-------|--------------|
| 0–1K workspaces | Single Postgres, Redis, 2 API replicas, 1 worker |
| 1K–10K | Read replica Postgres, Redis cluster, horizontal API/worker |
| 10K+ | Qdrant for vectors, split worker pools, CDN for widget |
| Chat hot path | Stateless API; conversation state in Redis cache + Postgres |

---

## 16. Admin UI Plan (RU-first)

### Design tokens

```css
--bg-base: #0a0a0b;
--bg-glass: rgba(255,255,255,0.04);
--accent-neon: #39ff14;
--accent-glow: 0 0 20px rgba(57,255,20,0.35);
--text-primary: #fafafa;
--border-glass: rgba(255,255,255,0.08);
```

- Sidebar + workspace switcher  
- Glassmorphism cards, Framer Motion hover/tap  
- Mobile: collapsible sidebar, bottom nav for key sections  
- shadcn/ui customized (dark only v1)

### Sections (Phase 1 functional)

1. **Dashboard** — stats cards (conversations, leads, token usage)  
2. **Агенты** — CRUD + playground  
3. **Ассистенты** — CRUD + live preview  
4. **Инструменты** — list + enable/disable (4 tools live)  
5. **База знаний** — upload + indexing status  
6. **AI Интеграции** — OpenAI + OpenRouter cards  
7. **Лиды** — table + detail  
8. **Виджеты** — embed code + domain config  
9. **Аналитика** — placeholder chart (real events Phase 2)  
10. **Настройки** — workspace, members  

---

## 17. Implementation Phases

### Phase 0 — Foundation (week 1)
- Monorepo scaffold, strict TS, Docker compose  
- Prisma schema core tables  
- Auth + workspace + RBAC  
- Admin shell layout (RU, dark theme)

### Phase 1 — AI Core (week 2)
- AiIntegration CRUD + encryption + validate + model sync  
- Agent CRUD + prompt versioning + playground  
- Provider adapters (OpenAI, OpenRouter)

### Phase 2 — Knowledge (week 3)
- KB CRUD, S3 upload, ingestion worker  
- pgvector search  
- RAG in orchestrator

### Phase 3 — Assistants + Tools (week 4)
- Assistant bindings  
- Tools: RAG_SEARCH, CALCULATOR, HTTP_REQUEST, LEAD_SAVER  
- Tool audit log

### Phase 4 — Widget + Realtime (week 5)
- Widget iframe app + loader script  
- Socket.io chat flow end-to-end  
- Leads auto-capture

### Phase 5 — Hardening (week 6)
- Rate limits, audit logs, healthchecks  
- `/review` + `/qa` pass  
- Production docker-compose + nginx

---

## NOT in Scope (Phase 1)

- Voice/video/screen share (architecture only)  
- DOCX/OCR/browser automation tools  
- URL crawling for KB  
- OAuth / SSO  
- Multi-region deployment  
- Advanced analytics dashboards  
- Anthropic/Gemini/Ollama adapters (interfaces only)  
- Email/Calendar/CRM tools  

---

## What Already Exists (reuse)

Greenfield — no legacy. Reuse **patterns** only:
- shadcn/ui component library  
- NestJS BullMQ module  
- Prisma pgvector extension  
- Socket.io Redis adapter  

---

## Failure Modes (critical gaps to address in implementation)

| Codepath | Production failure | Test | Error handling |
|----------|-------------------|------|----------------|
| Model sync | Provider API down | Integration test mock | status=INVALID, UI banner |
| Embed chat | WS disconnect mid-stream | E2E reconnect | Resume from last message id |
| RAG query | Empty KB | Unit test | Graceful "no knowledge" path |
| Tool HTTP | SSRF to internal IP | Security test | URL blocklist, no private IPs |
| Widget wrong domain | Spoofed origin | E2E | Reject handshake 403 |
| Encryption | Master key rotation | Unit test | keyVersion field + re-encrypt job |

---

## Risks & Tech Debt

| Risk | Severity | Mitigation |
|------|----------|------------|
| Scope creep | High | Strict phase gates; defer tools/providers |
| pgvector scale ceiling | Medium | VectorStorePort abstraction |
| Widget bundle size | Medium | Preact, code split, no admin UI libs in widget |
| OpenRouter model drift | Low | Scheduled sync-models job |
| RU-only v1 blocks EN market | Low | i18n structure from day 1 |

---

## Parallelization Lanes (post-approval)

| Lane | Modules | Depends on |
|------|---------|------------|
| A | `packages/database`, `packages/crypto`, auth | — |
| B | `packages/ai-core`, integrations, agents | A |
| C | `packages/vector`, worker ingestion | A, B |
| D | `apps/web` shell + sections | A |
| E | `apps/widget`, WS gateway | A, B |
| F | assistants, tools, leads | B, C |

Launch A first → B + D parallel → C + E → F.

---

## Implementation Tasks (post plan approval)

- [ ] **T1 (P1)** — Init monorepo (turbo, pnpm, strict TS, eslint)  
- [ ] **T2 (P1)** — Prisma schema Phase 0 tables + pgvector extension  
- [ ] **T3 (P1)** — Docker compose (postgres, redis, minio, api, worker, web)  
- [ ] **T4 (P1)** — Auth module + workspace RBAC  
- [ ] **T5 (P1)** — Admin layout shell RU dark/glass UI  
- [ ] **T6 (P2)** — AiIntegration + envelope encryption  
- [ ] **T7 (P2)** — OpenAI + OpenRouter adapters  
- [ ] **T8 (P3)** — Ingestion worker pipeline  
- [ ] **T9 (P4)** — Widget embed + WS chat  
- [ ] **T10 (P5)** — Leads + audit + rate limits  

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | OPEN | Plan draft, 0 code |
| CEO Review | `/plan-ceo-review` | — | 0 | — | Not run |
| Design Review | `/plan-design-review` | — | 0 | — | Not run |

- **UNRESOLVED:** Phase 1 scope confirmation (full vertical slice vs parallel modules)
- **VERDICT:** Plan ready for user approval → then scaffold Phase 0
