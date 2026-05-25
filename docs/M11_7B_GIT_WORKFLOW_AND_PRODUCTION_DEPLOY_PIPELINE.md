# M11.7B — Mandatory Git Workflow + Auto Deploy Pipeline + Production Release Discipline

> **Workflow:** `@gstack-plan` → `@gstack-eng` → `@gstack-devops` → `@gstack-review` → `@gstack-production-audit`  
> **Status:** Implemented — pending GitHub secrets + production deploy QA

---

## Executive Summary

Production releases are now **git-disciplined**: no dirty-tree deploys, CI gates on every push, auto-deploy from `main`, rollback checkpoints, and `release.json` metadata.

| # | Deliverable | Status |
|---|-------------|--------|
| P0 | Branch strategy + commit format + forbidden rules | ✅ `CONTRIBUTING.md` |
| P1 | GitHub Actions CI + deploy pipeline | ✅ |
| P2 | Preflight + health abort on failure | ✅ |
| P3 | `release.json` generation | ✅ |
| P4 | Rollback script + snapshot checkpoints | ✅ |
| P5 | This documentation | ✅ |

---

## Git Workflow

```
feature/* ──PR──► develop ──PR──► main ──push──► CI + Deploy
hotfix/*  ──PR──► main
```

### Every sprint (mandatory)

1. `git status`
2. `git add` (scoped files)
3. `git commit` (conventional)
4. `git push`
5. `./infra/scripts/deploy-production.sh` OR GitHub Actions on `main`
6. `./infra/scripts/health-verify-production.sh`
7. Rollback checkpoint auto-created by deploy

### Forbidden

- Dirty working tree deploy
- Force push to `main`
- Deploy without commit
- Skipping CI gates

---

## CI/CD Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Push / PR      │────►│  ci.yml          │────►│ lint/typecheck/     │
│  feature/develop│     │                  │     │ test/build          │
└─────────────────┘     └──────────────────┘     └─────────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Push main      │────►│ deploy-prod.yml  │────►│ ci-gate (reuse)     │
└─────────────────┘     └────────┬─────────┘     └─────────────────────┘
                                 │
                                 ▼
                    deploy-production.sh
                    ├── require-clean-git
                    ├── deploy-preflight (+ backup)
                    ├── snapshot-release (rollback)
                    ├── lint/typecheck/test/build
                    ├── rsync + migrate + pm2
                    ├── health-verify-production
                    └── generate-release.json
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `require-clean-git.sh` | Abort if working tree dirty |
| `deploy-preflight.sh` | Destructive scan, schema validate, backup, integrity audit |
| `backup-db.sh` | PostgreSQL gzip backup |
| `snapshot-release.sh` | Pre-deploy artifact checkpoint |
| `deploy-production.sh` | Full release pipeline |
| `health-verify-production.sh` | API, assets, pm2, nginx, TURN TCP |
| `generate-release-json.sh` | Write `release.json` metadata |
| `rollback-production.sh` | Restore latest checkpoint |

---

## release.json Format

```json
{
  "version": "M11.7B",
  "commit": "abc123...",
  "branch": "main",
  "deployedAt": "2026-05-22T12:00:00Z",
  "deployedBy": "github-actions",
  "health": "PASS"
}
```

Written locally to `release.json` (gitignored) and copied to `/var/www/agent.neeklo.ru/release.json`.

---

## Rollback Flow

1. Deploy creates checkpoint at `.releases/checkpoint-{timestamp}/`
2. Pointer: `.releases/latest-checkpoint`
3. Rollback:

```bash
./infra/scripts/rollback-production.sh
```

Restores: dist artifacts, `ecosystem.config.cjs`, previous `release.json`.  
Optional `--restore-db` prints latest backup path for manual restore.

---

## Production Checklist

Before merge to `main`:

- [ ] `pnpm lint typecheck test build` pass locally
- [ ] Migration tested (`prisma migrate deploy` dry-run on staging if available)
- [ ] No secrets in commit
- [ ] Conventional commit message

After deploy:

- [ ] `curl https://agent.neeklo.ru/api/health` → postgres/redis ok
- [ ] `curl -I https://agent.neeklo.ru/widget.js` → 200
- [ ] pm2 online on server
- [ ] `release.json` on server matches commit
- [ ] Widget + operator smoke test

---

## GitHub Setup

Repository: `git@github.com:letoceiling-coder/botme-gstack.git`

### Required secrets

| Name | Value |
|------|-------|
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/id_ed25519_beget` |
| `DEPLOY_HOST` | `212.67.9.173` (optional) |

### Environment

Create GitHub Environment `production` with required reviewers (optional).

---

## Emergency Recovery

1. **Failed deploy mid-flight:** `./infra/scripts/rollback-production.sh`
2. **Bad migration:** restore DB from `/var/backups/botme/botme-*.sql.gz`
3. **Health fail after deploy:** rollback + investigate logs `pm2 logs agent-botme-api`

---

## Changed Files

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `infra/scripts/require-clean-git.sh`
- `infra/scripts/snapshot-release.sh`
- `infra/scripts/health-verify-production.sh`
- `infra/scripts/generate-release-json.sh`
- `infra/scripts/rollback-production.sh`
- `infra/scripts/deploy-production.sh` (M11.7B hardened)
- `infra/scripts/deploy-preflight.sh` (FORBIDDEN_PATTERN fix)
- `CONTRIBUTING.md`
- `.gitignore` (release.json, .releases/)

---

## Rollback Notes (this sprint)

- Scripts are additive; reverting is safe
- Remove GitHub workflows to disable auto-deploy
- Checkpoints stored only on server under `.releases/`

**Readiness:** ~90% — requires `DEPLOY_SSH_KEY` secret + first green deploy from `main`
