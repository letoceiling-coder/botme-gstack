# M11.7 — Widget Connection Center + Operator Access Provisioning + Production Setup Documentation

> **Workflow:** `@gstack-plan` → `@gstack-eng` → `@gstack-review` → `@gstack-ui-product-audit` → `@gstack-production-audit`  
> **Status:** Implemented (pending production QA)

---

## Executive Summary

Страница `/admin/widgets` превращена в **Connection Center**: self-service onboarding для виджета, операторов, RTC и self-host без участия разработчика.

| # | Deliverable | Status |
|---|-------------|--------|
| P0 | Operator Connection Center (URLs, workspace access, live health) | ✅ |
| P1 | Operator access management (invite, roles, remove, online) | ✅ |
| P2 | In-UI connection instructions (widget, operators, RTC, diagnostics) | ✅ |
| P3 | White Label / Self-host copy-ready configs | ✅ |
| P4 | Premium 3-column widgets page UX | ✅ |
| P5 | WidgetConnectionHealthService (real checks, no mocks) | ✅ |
| P6 | This documentation | ✅ |

---

## Architecture

```
/admin/widgets (Connection Center UI)
    │
    ├── GET /widgets/:id/connection-center
    │       WidgetConnectionCenterService
    │       └── WidgetConnectionHealthService
    │             ├── Redis ping (WebSocket backend)
    │             ├── FEATURE_RTC_CALLS (signaling)
    │             ├── TCP turn:3478 (TURN)
    │             ├── HEAD /widget.js (widget runtime)
    │             ├── Assistant ACTIVE + modelId
    │             └── Default AI integration status
    │
    └── GET/POST /workspaces/current/members/*
            WorkspaceMembersService
            └── workspace_members + workspace_invites
```

---

## Operator Roles

| Role | Access |
|------|--------|
| **OWNER** | Full workspace |
| **ADMIN** | Operators, widgets, RTC, assistants |
| **OPERATOR** | Chats + calls (new enum value) |
| **MEMBER** | Legacy extended access |
| **VIEWER** | Monitor only (operator WS connect, no mutations) |

Migration: `20260522120000_m11_7_operator_role_and_invites`

---

## Operator Flow

1. Admin opens **Connection Center** → tab **Операторы**
2. Invites by email → existing user added immediately; new user gets copyable invite URL
3. Operator opens **Admin operator** or **Operator panel** URL from right sidebar
4. Login → WebSocket `/operator` → visitor list → takeover / video call

---

## Widget Flow

1. Copy embed code from tab **Виджет**
2. Paste before `</body>` on allowed domain
3. Live health confirms WebSocket + widget.js + assistant runtime
4. Preview iframe on the right column

---

## RTC Flow

- Signaling: Socket.IO namespaces `/widget`, `/operator`
- TURN: `turn.neeklo.ru:3478` (UDP/TCP)
- Tab **RTC** documents HTTPS, browsers, reconnect (ICE restart)
- Tab **Диагностика**: server checks + browser getUserMedia/permissions

---

## Changed Files

### API
- `apps/api/src/modules/widget-admin/application/widget-connection-health.service.ts`
- `apps/api/src/modules/widget-admin/application/widget-connection-center.service.ts`
- `apps/api/src/modules/widget-admin/presentation/widget-admin.controller.ts`
- `apps/api/src/modules/workspace/application/workspace-members.service.ts`
- `apps/api/src/modules/workspace/presentation/workspace-members.controller.ts`
- `apps/api/src/modules/realtime/operator.gateway.ts` (VIEWER+ connect)

### Shared
- `packages/shared/src/connection-center.ts`
- `packages/shared/src/workspace-members.ts`
- `packages/shared/src/auth.ts`, `rbac.ts`

### Database
- `packages/database/prisma/schema.prisma` — `OPERATOR`, `WorkspaceInvite`
- `packages/database/prisma/migrations/20260522120000_m11_7_operator_role_and_invites/`

### Web
- `apps/web/src/pages/widgets-page.tsx` (3-column Connection Center)
- `apps/web/src/components/widgets/*`
- `apps/web/src/lib/api.ts`

---

## Deploy Steps

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm build
# Apply migration on production DB
pnpm --filter @botme/database prisma migrate deploy
./infra/scripts/deploy-production.sh
```

### Rollback

1. Revert web + API bundles
2. Migration is additive (OPERATOR enum + invites table) — safe to leave; revoke invites manually if needed

---

## Production Validation

```bash
curl -s -b cookies.txt https://agent.neeklo.ru/api/widgets/{id}/connection-center | jq .health.overall
curl -s -b cookies.txt https://agent.neeklo.ru/api/workspaces/current/members
```

Manual QA:
- [ ] `/admin/widgets` — 3 columns, health chips animate
- [ ] Copy operator URLs works
- [ ] Invite operator by email
- [ ] Server health all green on production
- [ ] Browser diagnostics — camera/mic on HTTPS
- [ ] Self-host tab — nginx/CSP copy

---

## Unresolved Risks

- Invite accept on `/register?invite=token` — link issued on invite; full register flow hook is follow-up
- TURN health is TCP-only probe (UDP relay not fully validated from API)
- Operator panel on `demo.neeklo.ru/operator` depends on `DEMO_URL` env

**Readiness:** ~88% (pending production QA pass)
