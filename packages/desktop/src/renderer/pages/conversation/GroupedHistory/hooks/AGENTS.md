<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose
React hooks backing the grouped conversation-history sidebar: they sync the live conversation list and its generating/unread state, manage batch selection and bulk export, handle pin drag-and-drop reordering, persist workspace expand/collapse state, and run per-conversation actions (open, rename, delete, pin, remove project).

## Key Files
| File | Description |
| --- | --- |
| `useConversationListSync.ts` | Subscribes to an external sync store via `useSyncExternalStore`; exposes `conversations`, `isConversationGenerating`, `hasCompletionUnread`, `clearCompletionUnread`, `setActiveConversation`. Contains the stream-guard logic (`getSidebarStreamGuardDecision`, `SidebarStreamGuardDecision`) deciding when a stream message marks a conversation generating vs. completed, using a whitelist of generating message types. |
| `useConversations.ts` | Reads `ConversationHistoryContext`, scrolls the active route conversation into view (double-RAF), auto-expands all workspaces on first load only (#1156), prunes stale workspace entries, and persists expansion to localStorage. Returns `pinnedConversations`, `timelineSections`, `expandedWorkspaces`, `handleToggleWorkspace`. |
| `useConversationActions.ts` | Per-conversation handlers (open/navigate, rename modal, delete, batch delete, toggle pin, menu open, remove project) wired to `ipcBridge.conversation`, Arco `Modal`/`Message`, and `react-router` navigation. Returns modal state plus all `handle*` callbacks. |
| `useExport.ts` | Bulk export of selected conversations to JSON / Markdown / ZIP (with workspace files); manages export task state, target-path/directory selection, unique-filename resolution via `ipcBridge.fs`, cancellation, and I/O timeouts. |
| `useDragAndDrop.ts` | dnd-kit pointer-sensor drag reordering for pinned conversations; computes fractional sort orders, reindexes when needed, persists via `ipcBridge.conversation.update` (`merge_extra`), and emits `chat.history.refresh`. Disabled in batch mode, collapsed, or mobile. |
| `useBatchSelection.ts` | `Set<string>` selection state for batch mode; resets on exit, drops ids of deleted conversations, and provides `toggleSelectedConversation` / `handleToggleSelectAll` / `allSelected`. |
| `useWorkspaceExpansionState.ts` | Reads expanded-workspace ids from localStorage and stays in sync via a custom `aionui:workspace-expansion-changed` event and the `storage` event. Exports the storage key, event name, `readExpandedWorkspaces`, `dispatchWorkspaceExpansionChange`. |
| `useVisibleConversationIds.ts` | Derives the ordered list of currently visible conversation ids from grouped history + expansion state + sider-collapsed flag via `buildVisibleConversationIds`. |

## For AI Agents
- Renderer-only code: no Node.js APIs. All cross-process work goes through `ipcBridge` (`@/common`); side-channel UI updates use `emitter` (`@/renderer/utils/emitter`).
- Workspace expansion has two coupled sources: `useConversations.ts` writes localStorage + dispatches the change event, while `useWorkspaceExpansionState.ts`/`useVisibleConversationIds.ts` read it. When changing the storage shape or event, update both and keep `WORKSPACE_EXPANSION_STORAGE_KEY` / `WORKSPACE_EXPANSION_EVENT` consistent.
- Auto-expand intentionally runs once (`hasAutoExpandedRef`) so a manual collapse is not undone (#1156) — preserve that guard.
- `useConversationListSync.ts` uses a whitelist of generating message types on purpose; extend the whitelist rather than switching to a blacklist so unknown/internal message types don't trigger false spinners.
- Drag sort orders are fractional (`computeSortOrder`); trigger `reindexSortOrders` only when `needsReindex` reports precision loss, then persist all affected rows.

## Dependencies
### Internal
- `@/common` (ipcBridge), `@/common/config/storage` (`TChatConversation`), `@/common/chat/chatLib` (`TMessage`)
- `@/renderer/hooks/context/ConversationHistoryContext`, `@/renderer/hooks/context/LayoutContext`
- `@/renderer/utils/emitter`, `@/renderer/utils/platform`, `@/renderer/utils/ui/focus`, `@/renderer/utils/chat/conversationExport`
- `../utils/*` (`sortOrderHelpers`, `exportHelpers`, `groupingHelpers`, `visibleConversationOrder`), `../types`, sibling `conversationCache`
### External
- `react`, `react-router-dom`, `react-i18next`
- `@dnd-kit/core`, `@dnd-kit/sortable`
- `@arco-design/web-react` (`Modal`, `Message`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
