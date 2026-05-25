# Botme

Production AI SaaS platform — Phase 0 foundation.

## Quick start

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Admin: http://localhost:5173
- API: http://localhost:3001/health
- Widget embed: http://localhost:5174

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | All apps in dev mode |
| `pnpm typecheck` | Strict TS across monorepo |
| `pnpm test` | Unit tests |
| `pnpm lint` | Lint all packages |

## Phase 0 scope

- Auth (JWT + refresh cookies)
- Workspace + RBAC
- Admin shell (RU, dark, mobile-first)
- Socket.io admin + widget namespaces
- Docker infra (Postgres+pgvector, Redis, MinIO)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
