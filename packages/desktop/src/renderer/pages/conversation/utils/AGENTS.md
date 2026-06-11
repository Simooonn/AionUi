<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose

Renderer-side helpers for the conversation page: building IPC params to create CLI-agent / preset-assistant conversations, normalizing backend workspace-path errors into localized messages, warming up conversations, caching/refreshing conversation state via SWR, and computing the chat/preview/workspace panel layout.

## Key Files

| File                          | Description                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createConversationParams.ts` | Builds `ICreateConversationParams` for CLI agents (`buildCliAgentParams`) and preset assistants (`buildPresetAssistantParams`). Resolves preferred session mode, ACP model id, and a default aionrs-compatible provider/model (`getDefaultAionrsModel`). |
| `conversationCreateError.ts`  | Maps backend workspace-path error codes (incl. legacy `BAD_REQUEST` message patterns) to `WORKSPACE_PATH_UNAVAILABLE` / `WORKSPACE_PATH_RUNTIME_UNAVAILABLE`, and produces i18n create/runtime error messages with the offending `workspace_path`.       |
| `warmupConversation.ts`       | Per-conversation warmup orchestrator with an in-flight promise map, status store (`idle`/`preparing`/`ready`/`error`), and a subscribe/emit pub-sub. Calls `ipcBridge.conversation.warmup`.                                                              |
| `conversationCache.ts`        | `getConversationOrNull` (swallows 404 NOT_FOUND) and `refreshConversationCache` which writes into SWR cache key `conversation/<id>`.                                                                                                                     |
| `conversationRuntime.ts`      | `isConversationProcessing` (reads `runtime.is_processing`) and `isLegacyReadOnlyConversationType` (gemini/codex/remote/nanobot/openclaw-gateway set).                                                                                                    |
| `layoutCalc.ts`               | Layout constants plus `calcLayoutMetrics`: derives effective workspace px, dynamic chat min/max ratios, chat flex, and mobile drawer widths from container size.                                                                                         |
| `detectPlatform.ts`           | Viewport/UA checks: `detectMobileViewportOrTouch`, `isMacEnvironment`, `isWindowsEnvironment`.                                                                                                                                                           |
| `newConversationName.ts`      | `applyDefaultConversationName` — forces a new session's `name` to the localized default title.                                                                                                                                                           |

## For AI Agents

- Renderer-only code: no Node.js APIs. All cross-process calls go through `ipcBridge` / `configService` from `@/common`.
- Error normalization is intentionally defensive: it reads structured `isBackendHttpError` payloads first, then falls back to JSON embedded in error message strings, then legacy regex patterns — preserve all three layers when editing `conversationCreateError.ts`.
- `warmupConversation` dedupes by `conversation_id`; use `resetWarmupConversationStateForTests` to clear module-level maps in tests.
- `layoutCalc.ts` contains pre-existing Chinese inline comments — match that convention there; English elsewhere.
- User-facing strings in `conversationCreateError.ts` come from i18n keys (`conversation.createError.*`, `conversation.agentError.*`); add keys via the i18n workflow, don't hardcode.

## Dependencies

### Internal

`@/common` (ipcBridge, configService, adapter types, storage/config types), `@/common/utils` (parseError, resolveLocaleKey, presetAssistantResources, buildAgentConversationParams), `@/renderer/utils/model/*`, `@/renderer/utils/platform`, `@/renderer/hooks/agent/useAgents`.

### External

`swr` (cache mutate), `i18next` (`TFunction` typing).

<!-- MANUAL: notes below this line are preserved on regeneration -->
