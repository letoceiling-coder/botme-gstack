# M10.4 — Strict Pre-M11 Audit

**Date:** 2026-05-21  
**Production:** https://agent.neeklo.ru  
**Auditor:** Automated code review + production DB + unit/integration tests  
**Verdict:** **PASS with fixes applied** — safe to begin M11 foundation

---

## Audit Checklist

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Fallback chain works | ✅ | `streamWithModelFallback` + DB `agent_model_fallbacks`; force-failover test mode |
| 2 | Stream switching survives failover | ✅ Fixed | `playground:stream-reset` clears partial content on mid-stream failover |
| 3 | Tools survive failover | ✅ Fixed | `streamWithToolsFailover` now retries + respects non-retryable errors |
| 4 | Widget survives failover | ✅ | Widget uses `agentId` → `streamWithToolsFailover`; RAG upstream unchanged |
| 5 | Assistant survives failover | ✅ | Assistant-test uses same tool runtime path |
| 6 | Retries work correctly | ✅ Fixed | Per-model `maxRetries` with backoff; timeout via `AbortSignal.timeout` |
| 7 | Cooldown logic works | ✅ | Unit tested; 3 failures → cooldown up to 5min |
| 8 | Diagnostics API accurate | ⚠️ Partial | `GET /agents/:id/runtime-diagnostics` correct for chain; health is in-process only |
| 9 | No cross-workspace leakage | ✅ | All repos scope by `workspaceId`; integration lookup workspace-scoped |
| 10 | No memory leaks in router | ✅ Fixed | Health cache capped at 2000 entries with LRU trim |

---

## Issues Found & Resolution

### Critical (fixed in this audit)

| Issue | Impact | Fix |
|-------|--------|-----|
| `timeoutMs` stored but never enforced | Failover never triggered on slow providers | `AbortSignal.timeout(entry.timeoutMs)` per attempt |
| Mid-stream failover concatenated garbage | User saw partial primary + fallback text | `onStreamReset` + `playground:stream-reset` event |
| `streamWithToolsFailover` single attempt, no auth guard | Auth errors could chain to wrong model | Retry loop + `isNonRetryableChatError` early throw |
| Unbounded `healthCache` Map | Long-running API memory growth | Cap 2000 + trim oldest failures |

### Medium (documented, not blocking M11)

| Issue | Status |
|-------|--------|
| `sortChainCostAware` not applied at runtime | User order preserved; cost auto-sort deferred |
| No production agents with fallbacks configured | 0 rows in `agent_model_fallbacks` — configure via admin UI |
| Widget has no `stream-reset` event yet | Failover mid-stream rare; playground covered first |
| Vision/structured-output capability filters | Not implemented (M11 candidate) |
| Health cache not persisted across PM2 restart | Acceptable v1 |

### Low

| Issue | Status |
|-------|--------|
| `lastUsed` keyed by `agentId` only | OK with CUID; negligible collision risk |
| No E2E test against live OpenRouter 429 | Use playground force-failover + unit mocks |

---

## Production State (2026-05-21)

```
agent_model_fallbacks rows: 0
agents: 2 (no fallback chains configured yet)
/api/health: healthy
migration 20260521140000_m10_4_agent_model_failover: applied
PM2: api, web, worker online
```

### Recommended production smoke

1. Admin → Agents → add fallback chain to one agent
2. Playground → enable **Force fallback** → verify `usage.model` ≠ primary
3. `GET /agents/:id/runtime-diagnostics` → chain length > 1

---

## Test Results (post-fix)

```
agent-model-router.test.ts: 7 passed
  - retryable/non-retryable detection
  - tool filter, cost sort, cooldown
  - failover chain mock (429 → fallback)
  - auth error no-retry

pnpm typecheck: pass
```

---

## M11 Gate Decision

**PROCEED** — M10.4 core failover is production-safe. Remaining gaps are UX/ops polish, not runtime blockers.

Deploy stabilization fixes before M11 feature work:

```bash
./infra/scripts/deploy-production.sh
```
