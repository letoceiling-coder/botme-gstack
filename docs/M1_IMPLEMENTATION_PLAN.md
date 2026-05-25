# M1 — Schema & Security Foundation

> **Phase:** PHASE_1_M1_SCHEMA_AND_SECURITY  
> **Date:** 2026-05-20  
> **Scope:** Foundation only — no M2+ routes, UI, playground, widget chat

---

## Pre-Implementation Analysis

### Prisma schema (before M1)

| Model | workspaceId | Soft delete | Notes |
|-------|-------------|-------------|-------|
| User | — | ✅ deletedAt | Global identity |
| Workspace | — | ✅ deletedAt | Tenant root |
| WorkspaceMember | FK | — | RBAC role per workspace |
| RefreshToken | — | revokedAt | Auth only |

**Gap:** Zero AI/widget entities. pgvector extension enabled but unused.

### JWT payload (`@botme/shared`)

```typescript
{ sub, email, workspaceId, role, type: 'access' }
```

- Active workspace embedded in token — all admin ops scoped to `workspaceId`
- Role propagated: OWNER | ADMIN | MEMBER | VIEWER
- Switch workspace re-issues token with new workspaceId + role

### Guards (before M1)

| Guard | Status | Gap |
|-------|--------|-----|
| `JwtAuthGuard` | HTTP only | Not global; per-controller |
| `RolesGuard` | HTTP only | **Never registered**; WS unsupported |
| WorkspaceGuard | Missing | Client could pass foreign workspaceId in body |

### WebSocket auth (before M1)

| Namespace | Auth | Gap |
|-----------|------|-----|
| `/admin` | JWT verified | `role` not stored on socket.data |
| `/widget` | widgetKey string only | **No DB lookup**; any key accepted |

### Envelope crypto (`@botme/crypto`)

- AES-256-GCM, per-workspace DEK via HKDF-like SHA256(master + workspaceId + keyVersion)
- pack/unpack for Bytes column storage
- **Ready** — needs `IntegrationCredentialsService` wrapper + `maskApiKey`

---

## M1 Deliverables

### 1. Prisma migration

12 new models + 5 enums. All tenant tables include `workspaceId`, `createdAt`, `updatedAt`, soft delete where applicable, strict FKs.

### 2. `WorkspaceScopedRepository`

Abstract base forcing `{ workspaceId, deletedAt: null }` and cross-tenant assertion.

### 3. RBAC

- `RolesGuard` extended for HTTP + WS
- `WorkspaceGuard` as global APP_GUARD
- `RolesGuard` as global APP_GUARD
- Admin socket stores full `JwtPayload` including `role`
- `@botme/shared` RBAC permission map (documentation + tests)

### 4. Widget security

- `WidgetAuthService`: DB lookup by `publicKey`, active + not deleted
- `WidgetDomain` allowlist enforced on origin hostname
- Socket data: `{ widgetId, workspaceId, assistantId }` — **never** client-supplied assistantId

### 5. `IntegrationCredentialsService`

- encrypt on write, decrypt in-memory only
- `maskApiKey()` for DTOs
- `keyVersion` support

### 6. `AuditService` + `AuditRepository`

- Append-only audit log
- Helper methods for integration/agent/widget events (called by M2+)

### 7. Tests

- Unit: scoped repo, credentials, mask, RBAC guard
- Integration: tenant isolation, widget domain rejection, role forbidden

### 8. Explicitly NOT in M1

- HTTP controllers for integrations/agents/assistants
- Playground endpoints
- Widget chat events
- Provider adapters / model sync
- Admin UI CRUD pages

---

## File Plan

```
packages/database/prisma/schema.prisma          # extended
packages/shared/src/rbac.ts                     # permission map
packages/crypto/src/mask.ts                     # maskApiKey
apps/api/src/core/repository/                   # WorkspaceScopedRepository
apps/api/src/core/guards/                       # workspace + roles WS
apps/api/src/core/security/                     # credentials, audit, widget auth
apps/api/src/modules/foundation/                # FoundationModule
apps/api/test/m1-security.integration.test.ts
docs/M1_REPORT.md
```

---

## Execution Order

1. Schema + migrate + generate  
2. Shared RBAC + crypto mask  
3. Repositories + services  
4. Guards + gateway updates  
5. Tests + validation  

**Gate:** `@gstack-review` after `pnpm typecheck && pnpm test && pnpm lint`
