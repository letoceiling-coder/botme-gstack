# Phase 0 Report

## 1. Что сделано

### Monorepo
- `pnpm` + `turbo` + strict TypeScript
- `apps/`: `web`, `api`, `worker`, `widget`
- `packages/`: `database`, `shared`, `crypto`, `ui`, `ai-core`, `vector`

### Infra
- `infra/docker-compose.yml`: Postgres+pgvector, Redis, MinIO, healthchecks, volumes
- `.env.example` с production-ready переменными

### Backend (NestJS)
- Clean architecture: `domain / application / infrastructure / presentation`
- **Auth**: register, login, logout, refresh (httpOnly cookies), JWT access, RBAC roles
- **Workspace**: list, summary (real member count), create
- **Health**: `/health` — postgres + redis checks
- **Realtime**: Socket.io `/admin` + `/widget`, Redis adapter, heartbeat 25s/60s

### Database (Prisma)
- `User`, `Workspace`, `WorkspaceMember`, `RefreshToken`
- Soft delete (`deletedAt`) на User/Workspace
- pgvector extension enabled in schema

### Admin UI (RU-first)
- Dark premium + neon green + glassmorphism
- Mobile sidebar + adaptive layout
- Auth: login/register
- Dashboard: **real** workspace summary from API
- Future sections: **honest empty states** with phase labels (no fake data)
- Analytics: hidden (`FEATURES.analytics = false`)

### Widget foundation
- iframe embed + `loader/loader.ts` (postMessage, mobile fullscreen)
- Socket.io connect + ready message

### Worker
- BullMQ health queue bootstrap (ready for Phase 2 ingestion)

## 2. Что не сделано

- Docker не запущен в текущем окружении (Docker CLI отсутствует)
- DB migrate не применён (нужен Postgres)
- E2E browser QA (`/gstack-qa`) — после Docker + dev servers
- Nest modules stubs: integrations, agents, assistants, knowledge, tools, leads, widget CRUD — Phase 1–4

## 3. Risks

| Risk | Mitigation |
|------|------------|
| Docker unavailable locally | Document install; compose file ready |
| Cookie auth cross-port in dev | Vite proxy `/api` + `/admin` WS |
| Redis required for WS scale | Graceful: adapter connects at boot |

## 4. Tech debt

- `apps/api` module folders for Phase 1+ not scaffolded as Nest modules yet (avoid dead controllers)
- Widget loader multi-entry Vite build needs CI polish
- RLS policies deferred to Phase 2

## 5. Console status

- Not browser-verified (servers not started without DB)
- No `console.log` in production paths

## 6. TypeScript status

```
pnpm typecheck — PASS (all 10 packages)
pnpm test       — PASS (shared, crypto, api)
pnpm --filter @botme/api build — PASS
```

## 7. Production readiness (Phase 0)

| Criterion | Status |
|-----------|--------|
| Strict TS | ✅ |
| No mock data | ✅ |
| Real auth | ✅ |
| Real workspace isolation | ✅ |
| RU-first UI | ✅ |
| Mobile-first shell | ✅ |
| WS architecture | ✅ |
| Docker compose | ✅ (file ready) |

## 8. Next step — Phase 1

1. `docker compose -f infra/docker-compose.yml up -d`
2. `pnpm db:migrate`
3. `pnpm dev`
4. AI Integrations (OpenAI + OpenRouter) + Agents module
