<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# aionrs

## Purpose
Renderer-side UI and stream-handling logic for the `aionrs` conversation platform (the AionCore/AionRS agent backend). Renders the chat view, send box, and model selector, and subscribes to the IPC `responseStream` to drive running state, thought display, token usage, tool groups, and permission prompts.

## Key Files
| File | Description |
| --- | --- |
| `AionrsChat.tsx` | Top-level chat container. Wires `ConversationProvider` (type `'aionrs'`), artifact/message-list providers, `MessageList`, and `AionrsSendBox`. Default export wrapped via `HOC.Wrapper` with message-list and local-image providers. |
| `AionrsSendBox.tsx` | Composer for aionrs conversations: draft persistence (`getSendBoxDraftHook('aionrs')`), file attach/preview, slash commands, agent mode selection, command queue, and emits `aionrs.*` emitter events (e.g. `aionrs.selected.file`, `aionrs.workspace.refresh`). |
| `AionrsModelSelector.tsx` | Arco `Dropdown`/`Menu` model picker grouped by provider; shows a disabled "use CLI model" button when no selection. Compacts width for preview/mobile layouts. |
| `useAionrsMessage.ts` | Core hook subscribing to `ipcBridge.conversation.responseStream`. Buffers content per `msg_id`, throttles thought updates (50ms), manages `streamRunning`/`waitingResponse`/`hasActiveTools`, persists `last_token_usage`, and re-tags `acp_permission` → `permission` before `transformMessage`. |
| `useAionrsModelSelection.ts` | Hook exposing `AionrsModelSelection` (current model, providers, select handler). Filters out `gemini-with-google-auth` providers since AionCore lacks Google Auth. |
| `localCronCommands.ts` | Strips `<think>`/`[CRON_*]` tags from assistant output for display only; actual cron mutations are handled by backend StreamRelay middleware. |

## For AI Agents
- Renderer-only code: NO Node.js APIs. All backend access goes through `ipcBridge` / `@/common`.
- Stream state is mirrored in both `useState` and `useRef` to avoid IPC re-subscription; when editing `useAionrsMessage.ts`, keep state and `*Ref.current` updates in sync (see existing pairs).
- `localCronCommands` regexes use the global flag; reset `lastIndex` after `.test()` calls (already done) or matching breaks.
- Inter-component coordination uses the `emitter` with `aionrs.`-prefixed events, not props.
- Backend emits `acp_permission` with a legacy Confirmation-shaped payload — preserve the `type: 'permission'` re-tag.

## Dependencies
### Internal
`@/common` (ipcBridge, chatLib, config/storage), `@renderer/pages/conversation/Messages/*`, `@renderer/hooks/context/*`, `@renderer/components/chat/*`, `@renderer/hooks/agent/useModelProviderList`, `@renderer/pages/conversation/runtime` and `utils`.
### External
`react`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`, `classnames`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
