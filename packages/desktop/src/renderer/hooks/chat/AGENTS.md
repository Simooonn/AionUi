<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose

Renderer-side React hooks powering the chat send box and message stream: composition/IME-safe input, slash-command discovery and keyboard navigation, per-conversation draft and file-attachment state, streaming display effects, and auto title/initial-message orchestration. Each is a standalone hook consumed by the ACP / Codex / Gemini / GUID send boxes.

## Key Files

| File                           | Description                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAutoScroll.ts`             | `useEffect`-based follow-to-bottom: scrolls container on `content` change only when within `threshold` px of bottom (default 200).                                                                          |
| `useTypingAnimation.ts`        | `requestAnimationFrame` character-by-character reveal of streaming text; skips animation on shrink or jumps >1000 chars. Returns `{ displayedContent, isAnimating }`.                                       |
| `useCompositionInput.ts`       | IME-safe input: tracks `isComposing` (ref + state), exposes `compositionHandlers` and `createKeyDownHandler(onEnterPress, onKeyDownIntercept?)` that suppresses Enter while composing.                      |
| `useInputFocusRing.ts`         | Returns theme-aware border/shadow colors for the send-box focus ring via `useThemeContext`.                                                                                                                 |
| `useSendBoxDraft.ts`           | Module-level `Map` store keyed by conversation type (`acp`/`codex`/`aionrs`) + id; `getSendBoxDraftHook(type, initialValue)` returns a SWR-backed `useDraft` hook with functional `mutate`.                 |
| `useSendBoxFiles.ts`           | File-attachment logic shared across send boxes: `handleFilesAdded`, `processMessageWithFiles` (`@filename` refs), `clearFiles`; plus standalone `formatFilesForMessage` and `createSetUploadFile`.          |
| `useSlashCommands.ts`          | Fetches slash commands via `ipcBridge.conversation.getSlashCommands`, maps with `mapAcpCommandsToSlashCommands`; module-level 5-min TTL LRU cache (max 50), re-fetches on `agentStatus` change.             |
| `useSlashCommandController.ts` | Dropdown UI state machine: `matchSlashQuery` regex, filtering, `onKeyDown` (Arrow/Enter/Escape) navigation, builtin-execute vs template-insert behavior. Exports scroll helper `getScrollTopForActiveItem`. |
| `useAutoTitle.ts`              | Derives a conversation title from history (`deriveAutoTitleFromMessages`) when still the default name; persists via `ipcBridge.conversation.update` and emits `chat.history.refresh`.                       |
| `useInitialMessage.ts`         | Drains a `sessionStorage` `acp_initial_message_<id>` payload once ACP status is authenticated/active; state machine `idle→waiting_auth→sending→sent/failed` with `retry`.                                   |

## For AI Agents

- Renderer-only: no Node.js APIs. All cross-process calls go through `ipcBridge` (`@/common`); never import from `@process/*`.
- `useSendBoxDraft.ts` and `useSlashCommands.ts` keep state in **module-level** stores (a `Map` / cache) that outlive component mounts — mutate only through the provided setters and respect the conversation-type/`conversation_id` keys.
- Conversation `_type` union is exactly `'acp' | 'codex' | 'aionrs'`; both store helpers note a TODO to swap the `switch` for ts-pattern exhaustive checks — extend all branches when adding a type.
- Input hooks must stay IME-aware: gate Enter handling on `isComposing` (see `useCompositionInput`) rather than firing on every keydown.
- `useSlashCommands` deliberately waits for non-null `agentStatus` before fetching and uses a `requestIdRef` to drop stale responses — preserve both when editing.
- `@`-prefix on file refs is an ACP backend detail; `formatFileRef` strips it on the renderer side.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/chat/slash/*` (types, `acpMapping`, `availability`), `@/common/utils`, `@/renderer/hooks/context/ThemeContext`, `@/renderer/services/FileService`, `@/renderer/utils/chat/autoTitle`, `@/renderer/utils/emitter`, `@/renderer/utils/file/fileTypes`, `@/renderer/pages/conversation/utils/conversationCache`.

### External

`react`, `swr`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
