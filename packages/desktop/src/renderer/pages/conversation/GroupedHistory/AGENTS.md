<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# GroupedHistory

## Purpose
Renders the sidebar conversation history list, grouped by pinned status, workspace folder, and time-based timeline sections (today/yesterday/etc). Supports drag-and-drop reordering, batch selection/export, inline rename, cron job indicators, and full-text message search.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | `WorkspaceGroupedHistory` — top-level component wiring together conversations, drag-and-drop (`@dnd-kit`), batch mode, collapsible sections (persisted to `localStorage` under `grouped-history-collapsed-sections`), and modals for delete/directory selection. Composes the `hooks/` and `utils/`. |
| `ConversationRow.tsx` | Single conversation row: agent logo, name, cron status indicator, pin/edit/export/delete dropdown menu, batch checkbox, sider tooltips. Supports `dimIcon` for rows nested inside project folders. |
| `SortableConversationRow.tsx` | Thin `@dnd-kit/sortable` wrapper around `ConversationRow`; sorting disabled while in batch mode. |
| `DragOverlayContent.tsx` | Lightweight preview card shown under the cursor during a drag operation. |
| `ConversationSearchPopover.tsx` | Full-text message search popover; paged IPC search (`PAGE_SIZE=20`), snippet building with keyword highlighting, recent-keyword history in `localStorage`. |
| `types.ts` | Shared types: `WorkspaceGroup`, `TimelineItem`, `TimelineSection`, `GroupedHistoryResult`, `ExportTask`, `DragItem`, and component prop types. |
| `ConversationSearchPopover.css` | Scoped styles for the search popover. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `hooks` | React hooks for conversations data, batch selection, conversation actions, drag-and-drop, and export (see `hooks/AGENTS.md`). |
| `utils` | Grouping/timeline helpers and export helpers like `getBackendKeyFromConversation`, `isConversationPinned` (see `utils/AGENTS.md`). |

## For AI Agents
- Renderer-only code: no Node.js APIs. Cross-process work (search, export, file ops) must go through `ipcBridge` from `@/common`.
- The directory deliberately splits logic into `hooks/` (state/behavior) and `utils/` (pure helpers); keep `index.tsx` as orchestration, push new logic into those subdirs.
- Persisted UI state uses raw `localStorage` keys wrapped in try/catch — follow the existing pattern (collapsed sections, recent search keywords).
- Use Arco components and `@icon-park/react` icons only; colors via CSS variables (e.g. `var(--color-bg-1)`) or UnoCSS, no hardcoded hex.
- All user-facing strings go through `useTranslation()`/`t()`.

## Dependencies
### Internal
- `@/common` (ipcBridge, `config/storage` types, `types/team/database`)
- `@/renderer/components` (AionModal, settings/DirectorySelectionModal, layout/FlexFullContainer)
- `@/renderer/hooks` (LayoutContext, agent/usePresetAssistantInfo)
- `@/renderer/utils` (model/agentLogo, ui/siderTooltip, ui/focus)
- `@/renderer/pages/cron` (useCronJobsMap, CronJobIndicator)
- `../components/WorkspaceCollapse`

### External
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `@arco-design/web-react`, `@icon-park/react`
- `react`, `react-dom`, `react-i18next`, `react-router-dom`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
