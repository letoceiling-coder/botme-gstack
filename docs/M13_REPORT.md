# M13 Report - Adaptive Widget Viewport And Mobile Keyboard

## Architecture Changes

- Added a widget runtime viewport synchronizer based on `window.visualViewport`.
- The public loader now resizes the opened mobile iframe to the real visual viewport height and offset, instead of relying only on `100dvh`.
- The widget iframe writes CSS variables for the active viewport height and marks keyboard-open state on `documentElement`.
- Mobile CSS now keeps the composer/footer visible, compresses header spacing while the keyboard is open, and prevents quick actions from stealing vertical space.

## Changed Files

- `apps/widget/loader/loader.ts`
- `apps/widget/src/app.tsx`
- `apps/widget/src/lib/use-widget-viewport.ts`
- `apps/widget/src/widget.css`
- `docs/M13_REPORT.md`

## Migrations

- No database migration required.

## Nginx / PM2 Changes

- No nginx changes.
- No PM2 changes.

## Deploy Steps

1. Build widget artifacts.
2. Deploy `apps/widget/dist` and `widget.js` through the existing production deploy pipeline.
3. Because `widget.js` is already served with `no-store`, mobile clients should receive the new loader without long cache delay.

## Rollback Notes

- Revert the changed widget files and redeploy widget artifacts.
- No data rollback required.

## Production Validation

- Local validation completed:
  - `pnpm --filter @botme/widget typecheck`
  - `pnpm --filter @botme/widget build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Manual device QA is still recommended on:
  - iOS Safari
  - Android Chrome
  - Windows Chrome/Edge responsive mode

## Unresolved Risks

- Mobile keyboard behavior still varies by browser version and embedding site CSS; `visualViewport` handling covers modern iOS/Android/Chromium.
- Final confidence requires manual browser QA on real devices.

## Readiness

- Readiness: 94%
- Ready for production deploy after device smoke-test.
