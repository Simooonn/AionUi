<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Pure helper functions backing the GroupedHistory sidebar: grouping conversations by workspace, computing pin/drag sort orders, flattening the rendered tree into a visible-ID list (for keyboard/range selection), and serializing conversations to Markdown/JSON/ZIP for export. No React, no DOM, no Node APIs — just data transforms over `TChatConversation` and `TMessage`.

## Key Files
| File | Description |
| --- | --- |
| `groupingHelpers.ts` | `buildGroupedHistory` is the main entry: filters out team-owned conversations, splits pinned (sorted by `sortOrder` then `pinned_at`) vs. normal, and groups normal ones into workspace timeline sections via `groupConversationsByWorkspace`. Also exports `isConversationPinned`, `isCronJobConversation`, `getConversationPinnedAt`. |
| `sortOrderHelpers.ts` | Fractional-index sort-order math for drag reordering. `getConversationSortOrder`, `computeSortOrder` (insert between neighbors with `SORT_ORDER_GAP=1000`), `needsReindex`, `reindexSortOrders`, `assignInitialSortOrders`. |
| `visibleConversationOrder.ts` | `buildVisibleConversationIds` flattens pinned + timeline sections into an ordered `string[]` of conversation IDs, respecting `expandedWorkspaces` / `siderCollapsed` to skip collapsed workspace children. |
| `exportHelpers.ts` | Export plumbing: `buildConversationMarkdown` / `buildConversationJson` serializers, `appendWorkspaceFilesToZip` (recursive `IDirOrFile` walk), `buildTopicFolderName`, `normalizeZipPath`, `withTimeout` (used with `EXPORT_IO_TIMEOUT_MS=15000`), `getBackendKeyFromConversation`. |

## For AI Agents
- Renderer-only code — never import Node APIs here; file/ZIP export reads happen elsewhere via IPC, this dir only builds path/content descriptors (`ExportZipFile`).
- Conversation metadata lives in untyped `conversation.extra`; these helpers cast it inline (e.g. `as { pinned?: boolean }`) rather than relying on the `TChatConversation` type. Follow that pattern when reading new `extra` fields.
- `..` /types.ts holds `GroupedHistoryResult`, `TimelineSection`, `TimelineItem`, `ExportZipFile` — keep return shapes in sync with it.
- Sorting uses `toSorted` (immutable). Newest-first ordering relies on `getActivityTime` from `@/renderer/utils/chat/timeline`.
- `groupConversationsByWorkspace` only groups conversations that have BOTH `extra.custom_workspace` and `extra.workspace`; everything else becomes a flat `conversation` timeline item.

## Dependencies
### Internal
- `@/common/config/storage` (`TChatConversation`), `@/common/chat/chatLib` (`TMessage`), `@/common/adapter/ipcBridge` (`IDirOrFile`)
- `@/renderer/utils/chat/timeline`, `@/renderer/utils/chat/conversationExport`, `@/renderer/utils/workspace/*`
- `../types` (GroupedHistory shared types)

<!-- MANUAL: notes below this line are preserved on regeneration -->
