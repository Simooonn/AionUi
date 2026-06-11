<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose

Unit tests for renderer-side chat helpers and message rendering. Covers `@`-file insertion path building, attachment path resolution inside `MessageText`, and safe logging when a `tool_call` arrives without a `call_id`.

## Key Files

| File                       | Description                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atFileQuery.test.ts`      | Tests `buildAtFileInsertion` (`@/renderer/utils/chat/atFileQuery`): prefers `relativePath`, escapes boundary chars (e.g. spaces → `@my\ file.ts`), returns `null` when no path.                                                                   |
| `messageText.dom.test.tsx` | DOM (`@testing-library/react`) test for `MessageText`: relative `[[AION_FILES]]` attachment paths resolve against `ConversationProvider` workspace; absolute paths pass through unchanged. Heavily mocks child components, Arco, icon-park, i18n. |
| `toolCallLogging.test.ts`  | Tests `logDroppedToolCallWithoutCallId` (`@/renderer/pages/conversation/Messages/hooks`): warns with safe metadata only (`conversation_id`, `msg_id`, `name`, `status`) and asserts no secret `args`/`input`/`output` leak into the log.          |

## For AI Agents

- These exercise **renderer** code (`@/renderer/*`); no Node APIs. The `.dom.test.tsx` file requires the jsdom environment and uses `@testing-library/react` + `vi.mock` to stub almost every dependency of `MessageText`.
- The `react-i18next` mock returns `defaultValue ?? key`, so assert on default text, not translated strings.
- `toolCallLogging.test.ts` is a privacy regression guard: any change to `logDroppedToolCallWithoutCallId` must keep tool args/input/output out of the warning payload (`JSON.stringify` check on `console.warn` calls).
- `MessageText` attachment splitting depends on the literal `[[AION_FILES]]` marker — keep test fixtures using that exact token.

## Dependencies

### Internal

`@/renderer/utils/chat/atFileQuery`, `@/renderer/utils/file/fileTypes`, `@/renderer/pages/conversation/Messages` (`hooks`, `components/MessageText`), `@/renderer/hooks/context/ConversationContext`, `@/common/chat/chatLib`

### External

`vitest`, `react`, `@testing-library/react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
