<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# conversation

## Purpose

Vitest unit tests for the renderer-side conversation feature (`packages/desktop/src/renderer/pages/conversation`). Covers the pure runtime-state logic that decides whether a conversation can send messages, is processing, or should gate queued commands.

## Subdirectories

| Directory | Purpose                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| runtime   | Tests for conversation runtime view state, command-queue execution gating, and sidebar stream-sync guards (see `runtime/AGENTS.md`) |

## For AI Agents

- These are renderer tests: subjects import from `@/renderer/pages/conversation/...`, so keep them DOM-free pure-function tests (no Node APIs, no real Electron/IPC).
- Tests exercise pure reducers/selectors exported alongside hooks (e.g. `conversationRuntimeViewStore`, `getCommandQueueExecutionGate`, `getSidebarStreamGuardDecision`) — assert on returned snapshots, not React behavior.
- Use the `@/` path alias and the standard `import { describe, expect, it } from 'vitest'` form; mirror the existing Apache-2.0 license header on new files.
- Runtime summaries are built via small `runtime({ ...overrides })` factories with sensible idle defaults — follow that pattern instead of constructing full `TConversationRuntimeSummary` objects inline.

## Dependencies

### Internal

- `@/renderer/pages/conversation/runtime`, `.../platforms`, `.../GroupedHistory/hooks` — units under test
- `@/common/config/storage` — `TConversationRuntimeSummary` type

### External

- `vitest`

<!-- MANUAL: notes below this line are preserved on regeneration -->
