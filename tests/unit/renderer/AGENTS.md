<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# renderer

## Purpose

Unit and jsdom-DOM tests for the Electron renderer process (`packages/desktop/src/renderer`). Covers conversation message rendering/merging/scrolling, ACP send-box and message hooks, runtime view state, font-size theming, and assorted renderer hooks and utilities.

## Key Files

| File                                   | Description                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AcpSendBox.dom.test.tsx`              | Renders `pages/conversation/platforms/acp/AcpSendBox` with heavily mocked deps; covers send wiring and failure handling. |
| `applyFontSizes.dom.test.ts`           | `utils/theme/applyFontSizes` writes clamped px values to CSS variables on `documentElement`.                             |
| `buildSendFailureError.test.ts`        | `acp/buildSendFailureError` classifies `BackendHttpError` (409 busy, 502 retryable, workspace-path, fallbacks).          |
| `ChatConversation.legacy.dom.test.tsx` | Legacy-runtime render of `conversation/components/ChatConversation` with mocked MessageList/providers.                   |
| `conversationRuntimeViewStore.test.ts` | Turn-id contract of `conversation/runtime/conversationRuntimeViewStore` (stale hydrate/stop/turn-completed ordering).    |
| `FontSizeStepper.dom.test.tsx`         | `components/settings/FontSizeStepper` stepping, bound disabling, reset behavior.                                         |
| `messageList.dom.test.tsx`             | `Messages/MessageList` row spacing, empty slot, loading skeleton.                                                        |
| `messageListStreaming.dom.test.tsx`    | MessageList streaming auto-follow scroll behavior (ResizeObserver-driven).                                               |
| `messageMerging.dom.test.tsx`          | Text/thinking segment merging vs splitting on tool-call interruption; compact tool-content hydration.                    |
| `messageThinking.dom.test.tsx`         | `Messages/components/MessageThinking` preserves elapsed time across remount.                                             |
| `messageToolGroupSummary.dom.test.tsx` | `MessageToolGroupSummary` lazy-loads full tool content on expand.                                                        |
| `normalizeDbMessage.test.ts`           | `Messages/hooks.normalizeDbMessage` restores tip localization and structured error metadata.                             |
| `pendingConfirmationsRecovery.test.ts` | `Messages/usePendingConfirmationsRecovery` permission-message build/detect/remove by id/call_id.                         |
| `useAcpMessage.dom.test.ts`            | `acp/useAcpMessage` hook message handling.                                                                               |
| `useAcpModelInfo.dom.test.ts`          | `hooks/agent/useAcpModelInfo` (SWR-backed) model-info fetching.                                                          |
| `useAutoScroll.dom.test.tsx`           | `Messages/useAutoScroll` scroll-follow logic.                                                                            |
| `useFontSizes.dom.test.ts`             | `useFontSizes` hook against a mocked configService subscriber registry.                                                  |
| `useGuidInput.dom.test.ts`             | Regression (ELECTRON-1K6): paste/drop files must not clear selected workspace dir.                                       |
| `useSiderTeamBadges.dom.test.ts`       | `pages/team/hooks/useSiderTeamBadges` badge counts.                                                                      |
| `useSlashCommands.dom.test.ts`         | `hooks/chat/useSlashCommands` command loading.                                                                           |
| `useUploadState.test.ts`               | Upload-state store abort wiring (ELECTRON-1K2).                                                                          |
| `warmupConversation.test.ts`           | `conversation/utils/warmupConversation` warmup invocation/state reset.                                                   |

## Subdirectories

| Directory | Purpose                                                      |
| --------- | ------------------------------------------------------------ |
| `api`     | Renderer API client tests (see `api/AGENTS.md`).             |
| `utils`   | Renderer utility/policy/cache tests (see `utils/AGENTS.md`). |

## For AI Agents

- Two styles: pure-logic specs (`*.test.ts`) and jsdom specs (`*.dom.test.{ts,tsx}`) using `@testing-library/react` (`render`/`renderHook`/`screen`/`act`).
- Components are isolated via dense `vi.mock(...)` of `@/common`, hooks, contexts, and `@arco-design/web-react`; `react-i18next` is mocked so `t(key)` echoes the key for assertable aria-labels/text.
- `vi.hoisted(...)` defines shared mock fns referenced inside `vi.mock` factories. SWR hooks wrap renders in `SWRConfig`.
- Run: `bun run test` (all) or target a file, e.g. `bun run test tests/unit/renderer/messageMerging.dom.test.tsx`.

## Dependencies

### Internal

Under test: `packages/desktop/src/renderer/**` (pages/conversation, hooks, components/settings, utils/theme). Some specs reuse `@/common` types and `BackendHttpError` from `@/common/adapter/httpBridge`.

### External

vitest, @testing-library/react, swr, react.

<!-- MANUAL: notes below this line are preserved on regeneration -->
