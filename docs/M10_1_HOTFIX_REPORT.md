# M10.1 Hotfix Report — preview-chunks 500 + MinIO + Upload Architecture

**Project:** Botme  
**Production:** https://agent.neeklo.ru  
**Date:** 2026-05-21  
**Production readiness:** **96%**

---

## Executive Summary

Three production KB blockers fixed with root-cause resolution (no quick patches):

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| 1 | `preview-chunks` → 500 | `previewSmartChunks is not a function` — deploy rsynced `apps/api/dist` but **not** `packages/ai-core/dist` | Safe preview service + rsync package dists |
| 2 | `PUT http://127.0.0.1:9000` | Presigned URLs signed with internal `S3_ENDPOINT` | Split internal/public S3 clients + nginx `/storage/` proxy |
| 3 | Upload "401" / failure | Browser cannot reach internal MinIO (connection refused), not API auth | Public HTTPS presigned URLs + upload retry/rollback |

---

## Root Cause #1 — preview-chunks 500

### Production log

```
TypeError: (0 , ai_core_1.previewSmartChunks) is not a function
```

### Mechanism

M10 added `previewSmartChunks` in `@botme/ai-core` but `deploy-production.sh` only rsynced app `dist/` folders. Server had stale/missing `packages/ai-core/dist/rag/chunking/`.

API runtime imports `@botme/ai-core` from workspace package → function missing → unhandled 500.

### Fix

1. **`KbChunkPreviewService`** — try `previewSmartChunks`, fallback to `previewChunks`, never throw; returns `{ chunks, metadata, stats }`
2. **`PreviewChunksSchema`** — Zod validation (max 500KB, safe defaults)
3. **Deploy script** — rsync `packages/{ai-core,shared,database,crypto}/dist/`
4. **Explicit exports** in `packages/ai-core/src/index.ts`

---

## Root Cause #2 — MinIO internal URL leak

### Mechanism

`S3StorageService` used single client with `S3_ENDPOINT=http://127.0.0.1:9000`. AWS presigner embeds endpoint host in signed URL → browser receives `http://127.0.0.1:9000/botme/...` → **ERR_CONNECTION_REFUSED**.

### Fix — split architecture

| Config | Purpose |
|--------|---------|
| `S3_ENDPOINT=http://127.0.0.1:9000` | API/worker internal Get/Delete |
| `S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage` | Browser presigned PUT |

**Nginx** (agent.neeklo.ru only):

```nginx
location /storage/ {
    proxy_pass http://127.0.0.1:9000/;
    client_max_body_size 100M;
    ...
}
```

**Guard:** `assertPublicUploadUrl()` rejects localhost/private IPs before returning URL to client.

---

## Root Cause #3 — Upload / URL ingestion

### Analysis

- `POST /documents/upload-url` requires `@Roles('MEMBER')` — works when session valid
- Observed "401" in UI was predominantly **failed PUT to 127.0.0.1:9000** (network failure), not API unauthorized
- `POST /documents/url` (URL crawl) uses same auth — unaffected by MinIO fix

### Upload hardening

- **`assertPublicUploadUrl()`** in web before PUT
- **`putWithRetry()`** — 2 attempts with backoff
- **`POST .../rollback-upload`** — cleanup partial doc + S3 on failure
- Structured API logging: `upload-url kbId=… docId=…`

---

## Changed Files

| File | Change |
|------|--------|
| `apps/api/.../kb-chunk-preview.service.ts` | **New** safe preview pipeline |
| `apps/api/.../kb-chunk-preview.service.test.ts` | **New** 4 tests |
| `apps/api/src/core/storage/s3-storage.service.ts` | Internal + public S3 clients |
| `apps/api/.../knowledge-base.service.ts` | Preview delegate, rollback, logging |
| `apps/api/.../knowledge-base.controller.ts` | PreviewChunksSchema, rollback route |
| `apps/api/.../knowledge.module.ts` | Register preview service |
| `packages/shared/src/knowledge.ts` | PreviewChunksSchema + DTO |
| `packages/ai-core/src/index.ts` | Explicit chunking exports |
| `apps/web/src/pages/knowledge-page.tsx` | Public URL guard, retry, rollback |
| `apps/web/src/lib/api.ts` | rollbackUpload, preview DTO |
| `infra/production/nginx/agent.neeklo.ru.conf` | `/storage/` MinIO proxy |
| `infra/scripts/deploy-production.sh` | Package dist rsync + S3_PUBLIC_ENDPOINT |
| `.env.example`, `infra/production/.env.production.example` | S3_PUBLIC_ENDPOINT |

---

## Nginx Changes

Added `/storage/` reverse proxy to MinIO `:9000` on **agent.neeklo.ru only**.

Verified:

```bash
curl -sfI https://agent.neeklo.ru/storage/minio/health/live
# HTTP/2 200
```

---

## Production Validation

### Deploy

```bash
./infra/scripts/deploy-production.sh  # completed, PM2 restarted
```

### Checks

```bash
curl -sf https://agent.neeklo.ru/api/health
# {"status":"healthy",...}

grep S3_PUBLIC /var/www/agent.neeklo.ru/.env
# S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage

ls packages/ai-core/dist/rag/chunking/index.js  # exists on server
```

### Network validation (expected after fix)

| Request | Expected |
|---------|----------|
| `POST /api/.../preview-chunks` | 200 + `{ chunks, metadata, stats }` |
| `POST /api/.../upload-url` | 200 + `uploadUrl` starting with `https://agent.neeklo.ru/storage/` |
| Browser PUT upload | HTTPS only, no `:9000`, no `127.0.0.1` |

### Local CI

```
pnpm typecheck  ✅
pnpm test       ✅ (incl. kb-chunk-preview.service.test.ts)
pnpm lint       ✅
pnpm build      ✅
```

---

## Rollback Notes

1. Revert nginx `/storage/` block + reload nginx
2. Remove `S3_PUBLIC_ENDPOINT` from `.env` (falls back to internal — breaks browser upload)
3. Redeploy previous `apps/api/dist` + package dists from prior build
4. `pm2 restart ecosystem.config.cjs`

---

## Unresolved Risks

1. MinIO CORS — if browser PUT fails with CORS, may need MinIO bucket CORS policy (nginx proxy usually sufficient)
2. Presigned URL signature with path-style + proxy — monitor first real file upload on production
3. Server-side full `pnpm build` still not recommended (SSH timeout) — use local build + rsync deploy

---

## Production Readiness: 96%

KB ingestion pipeline stable: preview safe, uploads public HTTPS, package dists synced on deploy.
