# M2 Runtime Fix Report — `@botme/shared` Export Drift

> **Date:** 2026-05-20  
> **Error:** `Uncaught SyntaxError: The requested module '@botme/shared' does not provide an export named 'WS_NAMESPACES'`  
> **Affected:** `apps/widget`, `apps/web` (Vite/Rollup ESM consumers)

---

## 1. Root Cause

**Not** a missing symbol, stale dist, or forgotten barrel export.

| Layer | Finding |
|-------|---------|
| Source | `WS_NAMESPACES` defined in `packages/shared/src/constants.ts` |
| Barrel | Re-exported via `export * from './constants.js'` in `src/index.ts` |
| Types | `dist/index.d.ts` correctly declares `WS_NAMESPACES` |
| CJS dist | `dist/index.js` (old tsc output) contained `WS_NAMESPACES` at runtime via `__exportStar` |

**Exact root cause:** **CJS/ESM interop failure in Vite/Rollup static analysis.**

`@botme/shared` was built with `tsc` as **CommonJS** (`"use strict"` + `exports.*` + `__exportStar`). Node.js can import this at runtime, but **Rollup cannot discover named exports** re-exported through TypeScript's `__exportStar` helper.

Reproduction:

```bash
pnpm --filter @botme/widget build
# → "WS_NAMESPACES" is not exported by "../../packages/shared/dist/index.js"
```

Vite apps (`type: module`) resolve `@botme/shared` → `dist/index.js` and perform static ESM `import { WS_NAMESPACES }`. Rollup sees a CJS module with no analyzable named exports → runtime/build failure.

---

## 2. Why Typecheck Passed

| Tool | What it reads | Result |
|------|---------------|--------|
| `tsc --noEmit` | `src/*.ts` + `dist/index.d.ts` | ✅ Types declare `WS_NAMESPACES` |
| NestJS API `tsc` | Same `.d.ts` | ✅ |
| Vitest (shared) | Source files directly | ✅ |
| Vite/Rollup | **Runtime JS module graph** | ❌ CJS `__exportStar` invisible to static analysis |

TypeScript validates **types**, not **Rollup's ability to tree-shake CJS re-exports**. No export smoke test existed against built `dist/`.

---

## 3. Why Runtime Failed

```
apps/widget (ESM)
  import { WS_NAMESPACES } from '@botme/shared'
       ↓
packages/shared/dist/index.js (CJS via tsc)
  __exportStar(require("./constants.js"), exports)
       ↓
Rollup: no static named export "WS_NAMESPACES" → SyntaxError in browser
```

Browser never reached runtime CJS interop — failure at **module linking** phase.

---

## 4. Fix Applied

### 4.1 Dual-format build with tsup

Replaced `tsc` emit with **tsup** dual output:

| File | Format | Consumer |
|------|--------|----------|
| `dist/index.js` | ESM with explicit `export { WS_NAMESPACES, ... }` | Vite (web, widget) |
| `dist/index.cjs` | CJS | NestJS API, worker (require) |
| `dist/index.d.ts` | Types | All |

### 4.2 Package exports map

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    }
  }
}
```

Node and bundlers now resolve the correct format via **conditions**, not implicit `main` guessing.

### 4.3 Turbo dev pipeline

```json
"dev": { "dependsOn": ["^build"] }
```

`pnpm dev` builds workspace dependencies (including `@botme/shared`) before starting Vite — no manual rebuild ritual.

---

## 5. Regression Prevention

Added `packages/shared/src/exports.smoke.test.ts`:

- Imports `dist/index.js` (ESM) — verifies all symbols required by Vite apps
- Requires `dist/index.cjs` (CJS) — verifies Node consumers
- Runs in `pnpm --filter @botme/shared test` (after `^build` in turbo)

**CI gate:** missing export → test failure → blocks merge.

---

## 6. Validation

```bash
pnpm --filter @botme/shared build   # dist/index.js contains export { WS_NAMESPACES }
pnpm --filter @botme/shared test    # 8/8 including smoke tests
pnpm --filter @botme/widget build   # ✅ (was failing)
pnpm --filter @botme/web build      # ✅
pnpm typecheck                      # ✅ 15/15 packages
```

---

## 7. Files Changed

| File | Change |
|------|--------|
| `packages/shared/tsup.config.ts` | New dual ESM+CJS build |
| `packages/shared/package.json` | `exports` map, tsup build script |
| `packages/shared/src/exports.smoke.test.ts` | Export smoke test |
| `turbo.json` | `dev` depends on `^build` |

**Not changed:** source symbols, import paths in apps, hotfix re-exports.

---

## 8. Lessons

1. **Monorepo packages consumed by Vite must emit ESM** (or be source-linked like `@botme/ui`).
2. **`tsc` CJS + `export *` ≠ Rollup-compatible ESM named exports.**
3. **Typecheck ≠ bundler export validation** — smoke test built `dist/` in CI.
4. **`package.json#exports`** is required for dual Node/browser consumers.

---

*Fix verified. Widget and web load without `WS_NAMESPACES` export errors.*
