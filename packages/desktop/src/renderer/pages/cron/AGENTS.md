<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# cron

## Purpose

Renderer-side scheduled-task ("cron job") feature for AionUi: hooks and utilities that fetch, subscribe to, format, and repair `ICronJob` records over the cron IPC bridge. Powers the scheduled-tasks UI and the per-conversation cron indicator/manager components.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                 | Barrel re-exporting `CronJobIndicator` / `CronJobManager` (from `components/`) and the `useCronJobs` / `useCronJobsMap` hooks.                                                                                                                                                                                                     |
| `useCronJobs.ts`           | Core hooks. `useCronJobs(conversation_id)` loads jobs for one conversation with loading/error state; `useCronJobsMap()` groups all jobs by conversation and tracks unread-execution red-dot state (persisted in `localStorage` key `aionui_cron_unread`). Internal `useCronJobActions` wraps pause/resume/delete/update IPC calls. |
| `cronUtils.ts`             | Pure display/format helpers: `formatSchedule`, `formatNextRun`, `getJobStatusFlags`, plus `getCurrentCronTimeZone` (IANA tz, falls back to `UTC`) and `createCronSchedule`. `formatCronExpr` maps standard 5-field cron exprs to i18n strings under `cron.page.scheduleDesc.*`.                                                    |
| `repairCronJobTimeZone.ts` | One-time/in-flight-deduped migration that backfills a missing `schedule.tz` on cron jobs via `cron.updateJob`. Exposes `hasMissingCronTimeZone`, `repairCronJobTimeZone(s)`, and `repairAllCronJobTimeZonesOnce` (called at app bootstrap).                                                                                        |

## Subdirectories

| Directory            | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `ScheduledTasksPage` | Full scheduled-tasks management page UI (see `ScheduledTasksPage/AGENTS.md`).       |
| `components`         | `CronJobIndicator` and `CronJobManager` UI components (see `components/AGENTS.md`). |

## For AI Agents

- Renderer-only: no Node.js APIs. All cron data access goes through `ipcBridge.cron.*` (`listJobs`, `listJobsByConversation`, `updateJob`, `removeJob`), never direct main-process calls.
- `ICronJob` and its discriminated `schedule` union (`kind: 'cron' | 'every'`) come from `@/common/adapter/ipcBridge` — match the existing `Extract<..., { kind: 'cron' }>` narrowing pattern rather than casting.
- Format helpers take `t: TFunction`; all user-facing schedule text must resolve to `cron.page.*` i18n keys — do not hardcode strings.
- Time zones: always anchor new cron schedules with `createCronSchedule`/`getCurrentCronTimeZone`; missing-tz jobs are silently repaired, so don't assume `schedule.tz` is empty.
- Repair and `repairAll...Once` use module-level in-flight maps/promises for dedup — keep new IPC mutations idempotent and reuse these guards.

## Dependencies

### Internal

- `@/common` (ipcBridge), `@/common/adapter/ipcBridge` (`ICronJob`), `@/common/config/storage` (`TChatConversation`)
- `@/renderer/utils/emitter` (cron event subscription)
- `./components/*` (re-exported via index)

### External

- `react` (hooks), `i18next` (`TFunction` typing)

<!-- MANUAL: notes below this line are preserved on regeneration -->
