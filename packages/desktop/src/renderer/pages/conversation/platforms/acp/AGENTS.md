<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# acp

## Purpose

Renderer-side UI and state hooks for the ACP (Agent Client Protocol) conversation platform. Renders the ACP chat surface (message list + send box), manages per-turn streaming state, sends messages over the `acpConversation` IPC bridge, and normalizes send failures into structured error tips.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AcpChat.tsx`              | Top-level ACP conversation component. Wires `ConversationProvider` (type `'acp'`), artifact/message-list providers, `MessageList`, the E2E injector, and `AcpSendBox`; calls `useAcpMessage` (with `skipWarmup` when a team permission is active). Default export wrapped via `HOC.Wrapper`. |
| `AcpSendBox.tsx`           | The ACP input/send box. Composes `SendBox`, file attach/preview, agent mode selector, thought display, slash commands, and command queueing; sends via `ipcBridge.acpConversation.sendMessage`. Uses a dedicated `'acp'` draft hook.                                                         |
| `useAcpMessage.ts`         | Core stream-state hook. Returns `UseAcpMessageReturn` (running, `acpStatus` connection lifecycle, `aiProcessing`, thought, token usage, context limit, slash commands, etc.). Tracks per-turn flags via refs (content-in-turn, turn-finished guard, thinking message).                       |
| `useAcpInitialMessage.ts`  | Side-effect-only hook that reads an initial message from `sessionStorage` key `acp_initial_message_${conversation_id}` and auto-sends it on first mount; clears the key immediately to avoid duplicate sends.                                                                                |
| `buildSendFailureError.ts` | Maps a thrown send error to a typed `AgentStreamErrorInfo` (workspace-path errors, `BAD_GATEWAY` → `UNKNOWN_UPSTREAM_ERROR`, 409 "already processing" → `AIONUI_CONVERSATION_BUSY`, fallback `AIONUI_INTERNAL_ERROR`).                                                                       |
| `AcpE2EStreamInjector.tsx` | Test-only injector. Activates only when `sessionStorage[aionui:e2e-message-stream-conversation-id]` matches; exposes `window.__AIONUI_E2E_MESSAGE_STREAM__` controllers (`runScenario`, `emitInfoTip`, `emitFollowUpExchange`) for streaming/scroll E2E scenarios. Renders `null`.           |

## For AI Agents

- Renderer process only — no Node.js APIs. All backend calls go through `ipcBridge.acpConversation.*` (e.g. `sendMessage`).
- Connection state is the string union in `acpStatus` (`connecting`/`connected`/`authenticated`/`session_active`/`disconnected`/`error`/`null`); keep it in sync if you add states.
- `useAcpMessage` relies heavily on refs mirroring state for synchronous access inside event handlers (`runningRef`, `aiProcessingRef`, `turnFinishedRef`, etc.) — update both the ref and the state setter.
- New send-failure shapes belong in `buildSendFailureError`, not inline in the send paths (used by both `AcpSendBox` and `useAcpInitialMessage`).
- `AcpE2EStreamInjector` is a no-op outside E2E; do not let it run in normal flows. It directly calls `addOrUpdateMessage`.
- This is the ACP sibling of other platform dirs (`aionrs`, `gemini`, `legacy`); shared queue logic lives in `../useConversationCommandQueue.ts`.

## Dependencies

### Internal

- `@/common` (ipcBridge, `chat/chatLib`, `chat/slash`, `config/storage`, `utils`, `adapter/httpBridge`)
- `@renderer/pages/conversation/Messages/*` (MessageList, hooks, artifacts), `runtime/useConversationRuntimeView`, `utils/conversationCreateError`, `utils/warmupConversation`, `utils/conversationCache`
- `@renderer/components/chat/*`, `@renderer/components/agent/*`, `@renderer/components/media/*`, `@renderer/hooks/*`, `@renderer/pages/team/hooks/TeamPermissionContext`
- `../useConversationCommandQueue`, `../../utils/conversationCreateError`

### External

- `react`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
