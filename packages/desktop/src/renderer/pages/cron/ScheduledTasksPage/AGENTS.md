<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ScheduledTasksPage

## Purpose

Renderer UI for the cron / scheduled-tasks feature. Renders the task list page (card grid of `ICronJob`s with status, schedule, next-run, agent badge, and enable toggle), the per-task detail page, and the create/edit dialog. These are the visual surface over the cron IPC bridge and the shared hooks in `../` (`useCronJobs`, `cronUtils`).

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`            | Default-exported `ScheduledTasksPage`. Lists all jobs via `useAllCronJobs`, navigates to `/scheduled/:id`, toggles enable/disable (`pauseJob`/`resumeJob`), opens `CreateTaskDialog`, and exposes a "keep awake" switch backed by `systemSettings.setKeepAwake` + `configService`. |
| `TaskDetailPage.tsx`   | Default-exported detail view for route `/scheduled/:job_id`. Fetches a job via `ipcBridge.cron.getJob`, subscribes to `onJobUpdated`/`onJobExecuted`, supports run-now/edit/delete, lists linked conversations, and repairs job timezone via `repairCronJobTimeZone`.              |
| `CreateTaskDialog.tsx` | Default-exported `CreateTaskDialog` (create + edit mode via `editJob` prop). Arco `Form` for name/prompt/agent/model/workspace/schedule; `parseCronExpr` infers preset frequency (manual/hourly/daily/weekdays/weekly/custom) from a cron expr for editing.                        |
| `CronStatusTag.tsx`    | Small Arco `Tag` mapping `job.enabled` + `job.state.last_status` to a colored active/paused/error badge with i18n labels.                                                                                                                                                          |
| `jobAgentMeta.ts`      | `getJobAgentMeta(job, cliAgents)` resolves an agent's display name + logo. Handles the ACP case where `agent_type` is the literal `"acp"` and the real vendor id lives in `agent_config.backend`; strips `cli:`/`preset:` prefixes.                                                |

## For AI Agents

- Renderer-only code: no Node.js APIs; all backend access goes through `ipcBridge.cron.*` / `systemSettings.*` from `@/common`.
- Cron-job shape (`ICronJob`) and IPC params come from `@/common/adapter/ipcBridge` — reuse those types, don't redefine.
- Schedule helpers (`formatSchedule`, `formatNextRun`, `createCronSchedule`) and the data hooks live in the parent `../` cron dir, not here; import from there rather than duplicating logic.
- "Manual only" jobs are detected as `schedule.kind === 'cron' && !schedule.expr` — both the list card and detail page hide the enable switch in that case.
- All user-facing strings use `useTranslation()` under the `cron.*` key namespace; never hardcode text.
- Styling is UnoCSS utility classes with Arco component overrides via `!`-prefixed classes; semantic color tokens (`text-t-primary`, `bg-fill-1`, `border-2`, danger/success-\*) only.

## Dependencies

### Internal

- `@renderer/pages/cron/` — `useCronJobs`, `cronUtils`, `repairCronJobTimeZone`
- `@renderer/pages/conversation/hooks/useConversationAgents`, `conversation/utils/conversationCreateError`
- `@renderer/utils/model/*` — `agentLogo`, `agentTypes`, `agentModes`, `agentTypeSupportPolicy`
- `@renderer/components/*` — `base/ModalWrapper`, `workspace`
- `@/common` — `ipcBridge`, `systemSettings`, `ICronJob` types; `@/common/config/configService`

### External

- `@arco-design/web-react`, `@icon-park/react`, `react-router-dom`, `react-i18next`, `swr`, `dayjs`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
