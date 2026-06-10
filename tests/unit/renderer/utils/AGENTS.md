<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Unit tests for renderer-side utilities and conversation-page helpers under `packages/desktop/src/renderer/utils/` and `packages/desktop/src/renderer/pages/conversation|team/`. Covers agent-type/conversation-type policies, chat text processing (titles, think tags, LaTeX), file/MIME helpers, focus blocking, and conversation cache/error handling.

## Key Files
| File | Description |
| --- | --- |
| `agentTypeSupportPolicy.test.ts` | `model/agentTypeSupportPolicy`: which agent types are supported for new conversations, deprecation, `resolveSupportedConversationType`, `normalizeSupportedAgentSelection`. |
| `buildAgentConversationParams.test.ts` | `@/common/utils/buildAgentConversationParams`: backend→conversation-type mapping (only `aionrs` top-level, rest map to `acp`) and ACP backend param shaping. |
| `teamAgentTypePolicy.test.ts` | `team/components/agentSelectUtils`: `resolveConversationType`, `cliAgentToOption`, `filterTeamSupportedAgents` filtering retired runtimes from team creation. |
| `conversationReadOnlyPolicy.test.ts` | `conversation/utils/conversationRuntime` `isLegacyReadOnlyConversationType`: marks deprecated runtime conversation types read-only. |
| `conversationRuntime.test.ts` | `conversation/utils/conversationRuntime` `isConversationProcessing`: prefers runtime state over stale DB status. |
| `conversationCache.test.ts` | `conversation/utils/conversationCache` `getConversationOrNull`/`refreshConversationCache`: 404→null, rethrow non-404, SWR `mutate` skip. |
| `conversationCreateError.test.ts` | `conversation/utils/conversationCreateError`: normalize/translate backend create vs runtime-workspace error codes, legacy text fallback, stringified payload parsing. |
| `autoTitle.test.ts` | `chat/autoTitle` `buildAutoTitleFromContent`/`deriveAutoTitleFromMessages`: markdown stripping, truncation, first-user-message title derivation. |
| `getLastAssistantText.test.ts` | `chat/getLastAssistantText`: last visible assistant text, think-tag and `[SKILL_SUGGEST]` stripping, newline collapsing. |
| `thinkTagFilter.test.ts` | `chat/thinkTagFilter` `stripThinkTags`/`hasThinkTags`/`filterMessageContent`: think/thinking tag removal, detection, top-level-only content filtering. |
| `latexDelimiters.test.ts` | `chat/latexDelimiters` `convertLatexDelimiters`: `\[..\]`→`$$..$$`, `\(..\)`→`$..$`, preserving code spans/blocks. |
| `base64.test.ts` | `file/base64` `base64ToBlob` and `BINARY_MIME_MAP` extension→MIME mappings. |
| `workspaceMentions.test.ts` | `file/workspaceMentions` `filterWorkspaceMentionItems`: match ordering (exact/prefix before path) and missing-`name` resilience. |
| `common.test.ts` | `renderer/utils/common` `removeStack` (reverse-order cleanup) and `ToolConfirmationOutcome` enum values. |
| `focus.dom.test.ts` | `ui/focus` `blurActiveElement`, `blockMobileInputFocus`, `shouldBlockMobileInputFocus`: timed mobile focus blocking. |

## For AI Agents
- Pure-function tests use direct `describe/it/expect`. Module-state tests (`focus.dom.test.ts`) re-`import()` the module in `beforeEach` and use `vi.useFakeTimers()` with `vi.advanceTimersByTime`.
- Mocks: `autoTitle` and `getLastAssistantText` `vi.mock` `chat/thinkTagFilter`; `conversationCache` mocks `@/common` (`ipcBridge`) and `swr`'s `mutate`, asserting `BackendHttpError` handling.
- `conversationCreateError` supplies an inline fake `t()` translator with `{{workspacePath}}` interpolation instead of mocking i18n.
- DOM-dependent file `focus.dom.test.ts` uses the `.dom.test.ts` suffix (jsdom-style `document.activeElement` redefinition); others run as plain logic tests.
- Tests import source via `@/` alias paths. Run with `bun run test` (Vitest 4).

## Dependencies
### Internal
Under test: `renderer/utils/{chat,file,model,ui}`, `renderer/pages/conversation/utils`, `renderer/pages/team/components`, plus `@/common/utils`, `@/common/adapter/httpBridge` (`BackendHttpError`).
### External
vitest (`vi` mocks, fake timers), `swr` (mocked).

<!-- MANUAL: notes below this line are preserved on regeneration -->
