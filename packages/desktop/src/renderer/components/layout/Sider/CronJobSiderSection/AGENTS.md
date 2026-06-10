<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# CronJobSiderSection

## Purpose
Renders the collapsible "Scheduled Tasks" group in the left sidebar. Lists every cron job (`ICronJob`) as an expandable entry whose children are the conversations that job has spawned, with full conversation row actions (open, rename, delete, pin) and drag-to-reorder.

## Key Files
| File | Description |
| --- | --- |
| `CronJobSiderSection.tsx` | Section container. Persists expand state in `localStorage` (`cron-section-expanded`), batch-fetches conversations for `existing`-mode jobs via `getConversationOrNull` to avoid N+1 IPC, re-fetches on the `chat.history.refresh` emitter event, and renders one `CronJobSiderItem` per job. Returns `null` when `jobs` is empty. |
| `CronJobSiderItem.tsx` | Single cron-job entry. Loads child conversations via `useCronJobConversations(job.id)`, auto-expands when the active route matches the job detail (`/scheduled/:id`) or a child conversation, and wires `ConversationRow` actions: navigate, delete (`ipcBridge.conversation.remove`), rename (`conversation.update` + `refreshConversationCache`), and pin toggle (`merge_extra` update). Uses `@dnd-kit` `DndContext`/`SortableContext` for ordering and `useStoredSiderOrder` for persistence. |
| `index.ts` | Barrel re-exporting `CronJobSiderSection` as default. |

## For AI Agents
- Renderer-only React/TSX — no Node.js APIs; all data access goes through `ipcBridge` and the `emitter` event bus.
- Mutations (delete/rename/pin) must emit `chat.history.refresh` after a successful `ipcBridge.conversation.*` call so the section (and the rest of the history UI) re-syncs; rename also calls `refreshConversationCache`.
- The section passes a pre-fetched `existingConversation` prop down to each item specifically to avoid per-item IPC; keep batch-fetching in the parent rather than fetching inside the item.
- All user-facing text uses `t(...)` keys under `cron.*` and `conversation.history.*` — never hardcode strings.
- Use `@arco-design/web-react` (`Modal`, `Message`, `Input`) and `@icon-park/react` (`Right`, `Down`) — no raw HTML controls.

## Dependencies
### Internal
- `@/common` / `@/common/adapter/ipcBridge` / `@/common/config/storage` (IPC + `ICronJob`/`TChatConversation` types)
- `@/renderer/pages/conversation/utils/conversationCache`, `@renderer/pages/conversation/GroupedHistory/*`, `@renderer/pages/conversation/components/WorkspaceCollapse`
- `@renderer/pages/cron/useCronJobs`, `@renderer/hooks/context/*`, `@/renderer/utils/emitter`, `@/renderer/utils/workspace/workspace`
- `../SortableSiderEntry`, `../useStoredSiderOrder`

### External
`react`, `react-i18next`, `react-router-dom`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@arco-design/web-react`, `@icon-park/react`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
