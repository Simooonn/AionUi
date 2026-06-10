<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose
Renderer-side React components that surface cron (scheduled task) status inside the chat UI. They render small status pills/icons for a conversation's cron job and let users navigate to the scheduled-task detail view or trigger job creation.

## Key Files
| File | Description |
| --- | --- |
| `CronJobIndicator.tsx` | Stateless icon component (`CronJobStatus` = `none`/`active`/`paused`/`error`/`unread`/`unconfigured`). Renders an `@icon-park/react` icon (AlarmClock / PauseOne / Attention) wrapped in an Arco `Tooltip`; the `unread` state overlays a red dot. Used by ChatHistory to mark conversations with scheduled tasks. Default export. |
| `CronJobManager.tsx` | Pill for ChatLayout `headerExtra`. Shows one job per conversation. Fetches via `ipcBridge.cron.getJob` when a `cron_job_id` is supplied (child conversations) or via the `useCronJobs(conversation_id)` hook otherwise; subscribes to `onJobCreated/onJobUpdated/onJobRemoved`. Navigates to `/scheduled/:id` on click; the unconfigured state emits `sendbox.fill` to prefill a creation prompt. Hidden on mobile and when no skill+no jobs. Default export. |

## For AI Agents
- Renderer process only — no Node.js APIs. All cron data flows through `ipcBridge.cron.*` (invoke + event subscriptions); always call the returned unsubscribe functions in `useEffect` cleanup.
- Status color/flag logic is centralized: derive flags via `getJobStatusFlags(job)` from `../cronUtils`, not by re-reading job fields inline.
- All user-facing strings use `useTranslation()` with `cron.status.*` keys — never hardcode text. Icon colors come from `@/renderer/styles/colors` (`iconColors`); status dot colors are hardcoded hex here (`#f53f3f`/`#ff7d00`/`#00b42a`).
- Use Arco components (`Button`, `Tooltip`, `Popover`) and UnoCSS utility classes; no raw HTML interactive elements.

## Dependencies
### Internal
`@/common` (ipcBridge), `@/common/adapter/ipcBridge` (ICronJob type), `@/renderer/styles/colors`, `@/renderer/utils/emitter`, `@/renderer/hooks/context/LayoutContext`, `../useCronJobs`, `../cronUtils`
### External
`react`, `react-i18next`, `react-router-dom`, `@arco-design/web-react`, `@icon-park/react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
