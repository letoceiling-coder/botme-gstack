# M12 Report - Widget Setup Wizard And Assistant Publish Flow

## Architecture Changes

- Public widget readiness now treats the linked assistant state as an explicit admin-facing signal, not only a hidden runtime filter.
- Widget creation and activation publish the linked assistant automatically, preventing the public runtime from rejecting a newly created widget because the assistant is still `DRAFT`.
- Widget domains are normalized on the API side: `https://example.com/path` is stored as `example.com`, matching the hostname-based public allowlist check.
- The admin widgets page now opens a launch wizard after widget creation and whenever a selected widget is not ready.

## Changed Files

- `apps/api/src/modules/assistant/application/assistant.service.ts`
- `apps/api/src/modules/widget-admin/application/widget-admin.service.ts`
- `apps/api/src/modules/widget-admin/infrastructure/widget-admin.repository.ts`
- `apps/web/src/pages/assistants-page.tsx`
- `apps/web/src/pages/widgets-page.tsx`
- `packages/shared/src/widgets-admin.ts`
- `docs/M12_REPORT.md`

## Migrations

- No database migration required.
- Existing `Assistant.status`, `Assistant.isActive`, `WidgetInstance.isActive`, and `WidgetDomain.domain` fields are reused.

## Nginx / PM2 Changes

- No nginx changes.
- No PM2 process changes.

## Deploy Steps

1. Build shared/API/web artifacts.
2. Deploy API and web admin artifacts with the existing production deploy pipeline.
3. Restart/reload API and web processes as handled by the deploy script.

## Rollback Notes

- Revert the changed files above and redeploy API/web.
- No data rollback is required.
- Assistants auto-published by creating/enabling widgets can be manually set back to `DRAFT` from admin/API if needed.

## Production Validation

- Local validation completed:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
- Production deploy was not run in this sprint.

## Unresolved Risks

- Existing widgets linked to draft assistants are fixed when the admin opens the wizard and clicks "Исправить и опубликовать", or when the widget is re-enabled.
- The wizard still requires at least one domain; this is intentional because public widgets are protected by domain allowlist.

## Readiness

- Readiness: 96%
- Ready for deploy after standard production rollout.
