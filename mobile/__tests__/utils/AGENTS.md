<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Jest unit tests for the mobile app's pure helper modules in `mobile/src/utils`. Covers conversation grouping, streaming message transform/merge logic, the random-id generator, and workspace path display helpers.

## Key Files
| File | Description |
| --- | --- |
| `groupingHelpers.test.ts` | Tests `buildGroupedHistory` (pinned vs. normal split) and `groupConversationsByTimelineAndWorkspace` (Today/Yesterday/Last 7 Days/Earlier timeline buckets, workspace grouping by `extra.workspace`, localized temporary-workspace labels). Uses a fake `t` translator and a `makeConv` factory typed against `Conversation`. |
| `messageAdapter.test.ts` | Tests `transformMessage` (maps backend `IResponseMessage` types to UI `TMessage` with position/content; verifies ignored and unknown types return `undefined`) and `composeMessage` (text streaming concatenation, and merging of `tool_call`, `tool_group`, `plan`, `codex_tool_call`, `acp_tool_call` by their id fields). Mocks `@/src/utils/uuid` for deterministic ids. |
| `uuid.test.ts` | Tests `uuid(length)` for default length 8, custom/edge lengths, uniqueness, hex format, and the no-`crypto` counter fallback path (deletes `globalThis.crypto` in `beforeEach`, restores in `afterEach`). |
| `workspace.test.ts` | Tests `isTemporaryWorkspace`, `getWorkspaceDisplayName` (last segment, temp-session label with optional translator, Windows `\\` paths), and `getLastDirectoryName`. |

## For AI Agents
- These are React Native app tests (Jest, `describe`/`it`/`jest.mock`), NOT the desktop Vitest suite — do not mix the two runners or import `vitest`.
- Subjects under test import via two alias styles seen here: `../../src/utils/...` (relative) and `@/src/utils/...` (alias). Match the existing style of the file you edit.
- `messageAdapter.test.ts` relies on `jest.mock('@/src/utils/uuid', ...)` returning sequential `test-id-N`; keep that mock if asserting on generated ids.
- Grouping/workspace tests pass a stub `t(key)` translator; the temporary-workspace cases assert on `workspace.temporarySpace` resolving to the localized string and NOT leaking the English `Temporary Session` default.

## Dependencies
### Internal
- `mobile/src/utils/` (`groupingHelpers`, `messageAdapter`, `uuid`, `workspace`)
- `mobile/src/context/ConversationContext` (the `Conversation` type)
### External
- `jest`

<!-- MANUAL: notes below this line are preserved on regeneration -->
