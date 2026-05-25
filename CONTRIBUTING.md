# Contributing — Git & Release Discipline (M11.7B)

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production only — auto-deploy on push |
| `develop` | Integration branch |
| `feature/*` | Feature work → PR to `develop` |
| `hotfix/*` | Production fixes → PR to `main` |

## Commit format (Conventional Commits)

```
feat(widget): stable rtc reconnect engine
fix(rtc): resolve stale peer connection cleanup
chore(deploy): harden production preflight
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Required flow (every change)

1. `git status` — ensure scope is clear
2. `git add` — stage intentional files only
3. `git commit` — conventional message
4. `git push` — remote must be up to date
5. `./infra/scripts/deploy-production.sh` — from clean tree on `main`
6. Production verification — `health-verify-production.sh`
7. Rollback checkpoint — automatic snapshot before deploy

## Forbidden

- Anonymous or empty commit messages
- `git push --force` to `main`
- Local-only fixes without commit/push
- Deploy with dirty working tree
- Deploy without passing `pnpm lint typecheck test build`

## CI

- All pushes/PRs: `.github/workflows/ci.yml`
- Push to `main`: `.github/workflows/deploy-production.yml`

## GitHub secrets (production deploy)

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | Private key for `root@212.67.9.173` |
| `DEPLOY_HOST` | Optional, default `212.67.9.173` |

## Rollback

```bash
./infra/scripts/rollback-production.sh
# optional DB restore guidance:
./infra/scripts/rollback-production.sh --restore-db
```
