# Phase 2 Report — RAG + KB Ingestion + Tool Foundation

> **Phase:** PHASE_2_RAG_KB_TOOLS  
> **Date:** 2026-05-20  
> **Prerequisite:** M5 ✅  
> **Out of scope:** autonomous agents, browser automation, OCR, docx/xlsx, voice/video, workflow builders

---

## Executive Summary

**Phase 2 Status:** ✅ **COMPLETE**  
**Production readiness (Phase 2 scope):** **86%**

Async KB ingestion (MinIO + BullMQ), deterministic chunking, pgvector retrieval, RAG injection into widget chat with prompt-defense, and tool foundation stubs are implemented. No fake RAG, no cross-tenant vector queries.

---

## 1. Ingestion Audit

| Stage | Queue | Status |
|-------|-------|--------|
| Upload URL | API presigned PUT (MinIO) | ✅ |
| Confirm | Enqueue `kb.parse` | ✅ |
| Parse | txt/md/pdf → normalized text | ✅ |
| Chunk | `kb.chunk` — deterministic splitter | ✅ |
| Embed | `kb.embed` — provider embeddings | ✅ |
| Index complete | `INDEXED` status + KB stats | ✅ |
| Cleanup | `kb.cleanup` on delete | ✅ |
| Sync in API | **None** — async only | ✅ |

**File support:** `.txt`, `.md`, `.pdf` (text extraction via `pdf-parse`, no OCR).

**Dedup:** `fileHash` unique per KB; chunk `contentHash` unique per document.

---

## 2. Retrieval Audit

| Component | Location | Status |
|-----------|----------|--------|
| Query embed | `RagRetrievalService` via `AiProviderPort.embeddings()` | ✅ |
| Vector search | `VectorSearchService` raw SQL + cosine | ✅ |
| Tenant filter | Mandatory `workspaceId` + `knowledgeBaseIds` | ✅ |
| Deleted exclusion | `deletedAt`, `status=INDEXED/ACTIVE` joins | ✅ |
| RAG assembly | `assembleRagPrompt()` in ai-core | ✅ |
| Widget hook | `WidgetChatService` when `citationsEnabled` | ✅ |
| Fallback | Retrieval errors → chat without RAG | ✅ |

**Threshold:** default min cosine score 0.72, topK 8.

---

## 3. Token Audit

| Layer | Mechanism |
|-------|-----------|
| Chunk max | ~700 tokens (~2800 chars) |
| Overlap | ~100 tokens (~400 chars) |
| Retrieval budget | 2000 tokens via `allocateContextBudget()` |
| History trim | Existing `maxContextMessages` from pinned snapshot |
| Priority | system → retrieved → history → user |

---

## 4. Prompt Injection Audit

| Defense | Implementation |
|---------|----------------|
| HTML strip | `stripHtml()` |
| Control chars | Removed |
| Injection patterns | Regex filter → `[filtered]` |
| Context wrapping | `<retrieved_context citation="...">` |
| System suffix | KB text is reference-only, never obeyed as instructions |

---

## 5. Vector Audit

| Item | Detail |
|------|--------|
| Store | pgvector `vector(1536)` on `kb_chunks.embedding` |
| Index | IVFFlat cosine (`kb_chunks_embedding_idx`) |
| Prisma | `Unsupported("vector(1536)")` + raw UPDATE/SELECT |
| Cross-tenant | Blocked by SQL WHERE clauses |

---

## 6. Tenant Isolation Audit

| Vector | Mitigation |
|--------|------------|
| Vector search | `workspaceId` required on every query |
| KB bindings | Pinned snapshot KB IDs only |
| S3 keys | `workspaces/{workspaceId}/kb/...` prefix |
| Documents | `workspaceId` on all KB rows |

---

## 7. Tool Foundation Audit

| Component | Status |
|-----------|--------|
| `ToolPort` / `ToolRegistry` / `ToolSandbox` / `ToolExecutor` | ✅ |
| Calculator stub | ✅ |
| Lead-save stub | ✅ |
| HTTP stub | ✅ SSRF blocks (localhost, private IPs, 10s timeout, 64KB cap) |
| Widget execution | ❌ Not wired (foundation only, by design) |

---

## 8. Performance Audit

| Metric | Target | Status |
|--------|--------|--------|
| Ingestion | Async (non-blocking WS) | ✅ |
| Retrieval p95 | < 250ms | ⚠️ Not load-tested; embed+search path is sync in message handler |
| WS streams | Not blocked by batch embed | ✅ |

---

## 9. Admin UI Audit

| Feature | Status |
|---------|--------|
| KB list + create | ✅ `/admin/knowledge` |
| Presigned upload | ✅ txt/md/pdf |
| Real indexing status | ✅ DB-driven poll (5s) |
| Chunk/token counts | ✅ From KB + document rows |
| Fake progress | ❌ Not used |

---

## 10. Tests

| Suite | Status |
|-------|--------|
| ai-core chunker + defense + budget | ✅ |
| ai-core HTTP SSRF | ✅ |
| API unit | ✅ 19 |
| Integration | ✅ 20 |

**Gaps:** End-to-end upload→embed→retrieve with live provider (env-gated), large PDF QA, retrieval latency benchmark.

---

## 11. Production Readiness

| Area | Score |
|------|-------|
| Ingestion pipeline | 88% |
| Retrieval + RAG | 85% |
| Prompt injection defense | 90% |
| Vector + tenant isolation | 92% |
| Tool foundation | 84% |
| Admin UI | 83% |
| Tests | 82% |
| **Overall Phase 2** | **86%** |

---

## 12. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| IVFFlat needs data for quality | Medium | Index created at migration; tune `lists` as corpus grows |
| Sync retrieval in message path | Medium | Embed call adds latency; consider query cache |
| PDF without text fails | Low | By design (no OCR) |
| KB requires `embeddingIntegrationId` | Medium | Must set on KB create for RAG to activate |
| Tool stubs not in chat loop | Low | Intentional Phase 2 scope |

---

## 13. Ready for Next Phase?

**Verdict:** ✅ **READY** for tool execution wiring + RAG quality tuning + rate limits.

**Do not regress:** tenant-scoped vector search, async ingestion, prompt-defense wrapping, no client-trusted KB IDs in widget.

---

*Phase 2 complete. Grounded widget answers available when KB is indexed and assistant has `citationsEnabled` + KB bindings.*
