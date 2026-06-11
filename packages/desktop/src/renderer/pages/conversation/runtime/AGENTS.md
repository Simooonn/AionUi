<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# runtime

## Purpose

Renderer-side state machine that tracks per-conversation runtime status (idle/starting/processing, send-gating, stop-acknowledgement) for the conversation UI. It mirrors the backend `TConversationRuntimeSummary` while layering optimistic local gating (e.g. blocking the send button the instant a message is submitted, before the backend confirms a turn).

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversationRuntimeViewStore.ts` | Module-level store (not React) holding `runtimeViews`/`fallbackSnapshots`/`runtimeMetadata` Maps. Exports pure reducer functions (`hydrate*`, `turnCompleted*`, `localSend*`, `localStop*`, `resetLocalGate*`) and their committing wrappers that mutate the store, notify listeners, and return log entries. Provides `subscribe`/`getSnapshot` for `useSyncExternalStore`, plus `resetConversationRuntimeViewStoreForTest`. Handles stale-summary detection via `lastCompletedTurnId`. |
| `useConversationRuntimeView.ts`   | React hook `useConversationRuntimeView(conversation_id)` that subscribes to the store via `useSyncExternalStore`, hydrates from `getConversationOrNull`, listens to `ipcBridge.conversation.turnCompleted`/`listChanged`, and exposes `markSendStarted/Accepted/Failed`, `markStopRequested/Acknowledged`, `resetLocalGate`. Also exports `logStreamTerminalObserved`. All store transitions flush returned logs to the main process via `ipcBridge.application.writeRendererLog`.       |

## For AI Agents

- Renderer-only code (NO Node.js APIs). All cross-process access goes through `ipcBridge` (`@/common`).
- The store is a singleton outside React; reducer functions are pure (take `previous` view, return `{ view, logs }`) — keep them side-effect free and let the exported wrappers do the mutation + listener notification + log emission.
- Logging is structural: every transition returns `ConversationRuntimeViewLogEntry[]`; the hook flushes them. Don't drop the returned logs when calling store mutators.
- `localSubmitting`/`localStopping`/`pendingLocalSendSeq`/`pendingStopTurnId` implement optimistic gating; a backend summary matching `lastCompletedTurnId` with `is_processing === true` is treated as stale and ignored (see `isStaleCompletedRuntimeSummary`). Preserve this guard when editing.
- Keep `summarizeView` in sync with `ConversationRuntimeView` fields so log payloads stay complete.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/config/storage` (`TConversationRuntimeSummary`, `TConversationRuntimeStateKind`)
- `@/renderer/pages/conversation/utils/conversationCache` (`getConversationOrNull`)

### External

- `react` (`useSyncExternalStore`, `useCallback`, `useEffect`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
