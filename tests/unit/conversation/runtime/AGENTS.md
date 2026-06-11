<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# runtime

## Purpose

Vitest unit tests for the renderer's conversation runtime state machine — the pure
reducers/selectors that decide when a conversation can send, is processing, or must stay
gated. Covers the runtime view store, the command-queue execution gate, and the sidebar
stream guard, all driven by backend `TConversationRuntimeSummary` snapshots and local
send/stop events.

## Key Files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversationRuntimeViewStore.test.ts` | Exercises `@/renderer/pages/conversation/runtime/conversationRuntimeViewStore`: hydrate/local-send/local-stop/turn-completed transitions, the singleton store helpers (`hydrateSucceeded`, `localSendStarted`, `localSendAccepted`, `getConversationRuntimeViewSnapshot`, `resetConversationRuntimeViewStoreForTest`) plus the pure `*ConversationRuntimeView` variants. Asserts processing/sendability flags, `localSubmitting`/`localStopping` gates, stale-late event handling, and emitted log events (e.g. `runtime_release_confirmed`, `turn_completed_missing_runtime`). |
| `conversationCommandQueueGate.test.ts` | Tests `getCommandQueueExecutionGate` from `useConversationCommandQueue` — both the legacy `isHydrated`/`isBusy` path and the `runtimeGate` path that only executes queued commands when hydrated, sendable, and idle.                                                                                                                                                                                                                                                                                                                                                           |
| `conversationListSyncGuard.test.ts`    | Tests `getSidebarStreamGuardDecision` from `useConversationListSync` — marks generating streams, ignores late post-completion stream messages, lets a `start` event clear the completion guard, and ignores non-generating message types.                                                                                                                                                                                                                                                                                                                                       |

## For AI Agents

- Renderer-side logic only — no DOM/Node usage here; these are pure-function and
  singleton-store reducer tests.
- The store under test is a module-level singleton: tests that use the singleton helpers
  (not the `*ConversationRuntimeView` pure variants) must call
  `resetConversationRuntimeViewStoreForTest()` first to avoid cross-test leakage.
- Build runtime summaries via the local `runtime(overrides)` factory; it defaults to an
  idle/sendable summary, so only set the fields a case actually cares about.
- Assertions favor `toMatchObject` against the view shape and inspect returned `logs`
  arrays by `event` name — keep new cases consistent with that pattern.

## Dependencies

### Internal

- `@/common/config/storage` (type `TConversationRuntimeSummary`)
- `@/renderer/pages/conversation/runtime/conversationRuntimeViewStore`
- `@/renderer/pages/conversation/platforms/useConversationCommandQueue`
- `@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync`

### External

- `vitest`

<!-- MANUAL: notes below this line are preserved on regeneration -->
