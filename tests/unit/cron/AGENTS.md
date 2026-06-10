<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# cron

## Purpose
Vitest unit/DOM tests for the renderer's scheduled-tasks (cron) feature under `@/renderer/pages/cron`. Covers the `CronStatusTag` component, timezone helpers (`cronUtils`), bootstrap timezone repair, and the `useCronJobs` family of hooks.

## Key Files
| File | Description |
| --- | --- |
| `useCronJobs.dom.test.ts` | Largest suite. Tests `useCronJobs`, `useAllCronJobs`, `useCronJobsMap`, `useCronJobConversations` via `renderHook`/`waitFor`: mount fetch, timezone repair, pause/resume/delete/update, IPC event handlers (`onJobCreated/Updated/Removed/Executed`), unread tracking, and emitter `chat.history.refresh`. Mocks `@/common` ipcBridge and `@/renderer/utils/emitter`. |
| `CronStatusTag.dom.test.tsx` | Renders `CronStatusTag` with `@testing-library/react`; asserts i18n status keys (`cron.status.active/paused/error`) for enabled/disabled jobs and `last_status` values, plus presence of `.arco-tag`. |
| `repairCronJobTimeZone.test.ts` | Tests `repairAllCronJobTimeZones` and the dedup wrapper `repairAllCronJobTimeZonesOnce`; verifies `updateJob` is called with the resolved `tz` and that concurrent calls share one promise. Uses lazy `import()` + `vi.resetModules()`. |
| `cronUtils.test.ts` | Tests `createCronSchedule` and `getCurrentCronTimeZone`: system-timezone resolution via stubbed `Intl.DateTimeFormat`, with UTC fallback when resolution throws. |
| `.gitkeep` | Keeps the directory tracked. |

## For AI Agents
- These are renderer-side tests (jsdom). `*.dom.test.ts(x)` files use `@testing-library/react`; the timezone/util tests are plain logic tests.
- Common stubbing pattern: replace `Intl.DateTimeFormat` with a `vi.fn()`, capturing `originalDateTimeFormat` and restoring it in `afterEach`. Always restore to avoid leaking globals into sibling tests.
- IPC is never real: `@/common` is mocked so `ipcBridge.cron.*` / `ipcBridge.conversation.*` invoke/on are `vi.fn()`. `react-i18next` is mocked to return the key as the translation, so assert on i18n keys, not display text.
- `repairCronJobTimeZone.test.ts` relies on module-level singleton state for the `Once` dedup, so it uses `vi.resetModules()` + dynamic `import()` between cases — keep that pattern when adding tests there.

## Dependencies
### Internal
`@/renderer/pages/cron` (CronStatusTag, cronUtils, repairCronJobTimeZone, useCronJobs), `@/common` (ipcBridge), `@/common/adapter/ipcBridge` (ICronJob type), `@/common/config/storage` (TChatConversation), `@/renderer/utils/emitter`.
### External
`vitest`, `@testing-library/react`, `react`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
