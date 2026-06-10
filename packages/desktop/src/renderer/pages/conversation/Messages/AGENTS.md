<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Messages

## Purpose
Renders the scrolling chat message stream for a conversation. `MessageList` consumes the message-list context, groups raw `TMessage`s into virtual items (text, tool calls, tool/file summaries, artifacts), and dispatches each type to a dedicated renderer in `components/` or `acp/`. The hooks here own message-list state, indexing, streaming merge, auto-scroll, and pending-confirmation recovery.

## Key Files
| File | Description |
| --- | --- |
| `MessageList.tsx` | Main list component. Builds `IProcessedItem[]` (messages + `file_summary` / `tool_summary` / `artifact` virtual items), handles minimap jump events (`CHAT_MESSAGE_JUMP_EVENT`), and renders per-type message components. |
| `hooks.ts` | Message-list state via `createContext`: `MessageListProvider`, `useMessageList`, `useUpdateMessageList`, `useAddOrUpdateMessage`, `useRemoveMessageByMsgId`, `useMessageLstCache`, `beforeUpdateMessageList`, plus `ChatKeyProvider`/`useChatKey` and loading providers. Maintains a `WeakMap` message index (msg_id, call_id, tool_call_id, permission call_id) for fast streaming updates and merges. |
| `useAutoScroll.ts` | Auto-follow scroll hook for a plain scroll container; tracks bottom-gap, pins to bottom only while following, exposes `scrollToBottom` / `scrollElementIntoView` and a scroll-to-bottom button toggle. |
| `usePendingConfirmationsRecovery.ts` | Loads pending `IConfirmation`s over IPC and injects/removes synthetic `permission` messages (`confirmation:<id>` msg_id); listens to `confirmation.remove` stream. |
| `artifacts.tsx` | `ConversationArtifactProvider` + `useConversationArtifacts` context. Loads artifacts via `ipcBridge.conversation.listArtifacts`, subscribes to `artifactStream`, and upserts/sorts by `created_at`. |
| `MessageFileChanges.tsx` | Renders a `FileChangesPanel` from `writeFileChanges` / `diffsChanges`; click handlers launch preview via `usePreviewLauncher`. Re-exports `parseDiff` and `FileChangeInfo`. |
| `types.ts` | `ImageGenerationResult`, `WriteFileResult` tool-result shapes. |
| `constants.ts` | `TEXT_CONFIG` / `COLLAPSE_CONFIG` (line-height math, 4-line collapse cap). |
| `messages.css` | Mobile-only (`max-width: 767px`) typography and message-spacing overrides. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `acp` | ACP-protocol message renderers (tool calls, permissions) (see `acp/AGENTS.md`). |
| `components` | Per-message-type renderer components (text, thinking, tool call/group, plan, tips, permission, etc.) (see `components/AGENTS.md`). |

## For AI Agents
- Renderer process only — no Node.js APIs. All backend access goes through `ipcBridge` (`@/common`), e.g. `conversation.listArtifacts`, `confirmation.list`, and `.on(...)` streams which return an unsubscribe fn (call it in effect cleanup).
- Message-list state is context-based via `@renderer/utils/ui/createContext`, not Redux. To mutate the list, use `useUpdateMessageList` / `useAddOrUpdateMessage`; for pre-render transforms register with `beforeUpdateMessageList`.
- New virtual list items must be added to the `IProcessedItem` union and `getProcessedItemSourceMessageIds` in `MessageList.tsx`, and dispatched in its render switch.
- Streaming merge correctness depends on the `WeakMap` index keyed by msg_id/call_id; tool_calls without a `call_id` are dropped (see `logDroppedToolCallWithoutCallId`). Preserve those keys when editing merge logic.
- User-facing text uses i18n (`useTranslation`, e.g. `messages.fileChangesCount`); never hardcode strings.

## Dependencies
### Internal
- `@/common` / `@/common/chat/chatLib` (message types, `composeMessage`, merge helpers), `@/common/adapter/ipcBridge`
- `@renderer/hooks/context/ConversationContext`, `@renderer/hooks/file/*` (`usePreviewLauncher`, `useAutoPreviewOfficeFiles`)
- `@renderer/components/base/FileChangesPanel`, `@renderer/utils/file/diffUtils` & `fileType`, `@renderer/utils/chat/chatMinimapEvents`, `@renderer/utils/ui/*`, `@renderer/styles/colors`
- Local `./components`, `./acp`

### External
- `react`, `react-i18next`, `react-router-dom`, `@arco-design/web-react`, `@icon-park/react`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
