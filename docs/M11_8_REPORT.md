# M11.8 Report — Operator Embed SDK + Self-Host Runtime

## Architecture changes

- **Operator runtime tokens** (`OperatorRuntimeToken` model): scoped, revocable, expirable tokens for embed auth without cookie login.
- **`operator.js` SDK** at `/operator.js`: script embed with `data-workspace`, `data-operator-token`, `data-theme`, `data-position`.
- **`/operator-runtime/`** nginx route: same SPA as operator-panel, token bootstrap via `?token=`.
- **JWT exchange** `POST /api/public/operator-runtime/session` → access JWT with `runtimeTokenId` claim.
- **Operator WebSocket**: accepts `auth.token` for embed; dynamic origin validation via runtime token allowed domains; socket.io CORS `origin: true`.
- **Connection Center** tab «Кабинет оператора»: tokens, integrations (HTML/React/Vue/Nuxt/Next), live preview.

## Changed files

### Backend
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260522140000_m11_8_operator_runtime_tokens/`
- `packages/shared/src/auth.ts`, `connection-center.ts`
- `apps/api/src/modules/widget-admin/application/operator-runtime-token.service.ts`
- `apps/api/src/modules/widget-admin/application/widget-connection-center.service.ts`
- `apps/api/src/modules/widget-admin/presentation/operator-runtime-token.controller.ts`
- `apps/api/src/modules/widget-admin/presentation/operator-runtime-public.controller.ts`
- `apps/api/src/modules/widget-admin/widget-admin.module.ts`
- `apps/api/src/modules/realtime/operator.gateway.ts`

### Operator panel
- `apps/operator-panel/loader/operator.ts`
- `apps/operator-panel/vite.config.ts`
- `apps/operator-panel/src/lib/api.ts`
- `apps/operator-panel/src/lib/operator-socket.ts`

### Admin UI
- `apps/web/src/components/widgets/widget-operator-embed-panel.tsx`
- `apps/web/src/pages/widgets-page.tsx`
- `apps/web/src/lib/api.ts`

### Infra
- `infra/production/nginx/agent.neeklo.ru.conf`
- `infra/scripts/export-operator-runtime.sh`
- `infra/scripts/deploy-production.sh`
- `operator-runtime/` (config.json, env.example, nginx.conf.example, operator.html)

### Docs
- `docs/M11_8_OPERATOR_EMBED_AND_SELF_HOST_RUNTIME.md`

## Migrations

```bash
pnpm --filter @botme/database exec prisma migrate deploy
```

Migration: `20260522140000_m11_8_operator_runtime_tokens`

## Nginx / PM2

- nginx: `/operator.js`, `/operator-runtime/` locations added to `agent.neeklo.ru.conf`
- PM2: no changes (API restart only)

## Deploy steps

```bash
git add -A && git commit -m "feat(operator): embed SDK, runtime tokens, connection center (M11.8)"
git push origin main
./infra/scripts/deploy-production.sh
```

## Rollback notes

1. `./infra/scripts/rollback-production.sh`
2. Revert migration only if no tokens in use: `DROP TABLE operator_runtime_tokens;`
3. Remove nginx `/operator.js` and `/operator-runtime/` blocks if needed

## Production validation

```bash
curl -sI https://agent.neeklo.ru/operator.js | head -5
curl -sI https://agent.neeklo.ru/operator-runtime/ | head -5
curl -s https://agent.neeklo.ru/api/health
ssh root@212.67.9.173 pm2 status
```

Manual QA:
- Connection Center → generate token → copy script embed
- Open `/operator-runtime/?token=…` → panel loads without login
- WebSocket connects (operators online counter)
- Takeover + chat + RTC with widget

## Unresolved risks

- JWT access TTL (15 min) for long embed sessions — socket stays connected; may need silent re-exchange
- Self-host on customer domain without API proxy requires CORS_ORIGINS update
- RTC «нет соединения» from prior sprints — retest after deploy with fresh bundles

## Readiness

**96%** — operator embed + tokens + Connection Center + self-host package + docs complete. Pending production manual RTC QA after deploy.
