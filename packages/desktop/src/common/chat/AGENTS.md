<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose

Shared chat domain logic used by both the Main process and Renderer: the canonical message type definitions (`TMessage` and friends), conversion of raw IPC `IResponseMessage` streams into typed UI messages, tool-call normalization, `@` file-reference parsing, and image generation. This is the source of truth for what a chat message looks like across processes.

## Key Files

| File                        | Description                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chatLib.ts`                | Core message model. Declares the `IMessage<Type, Content>` shape and concrete `IMessageText/Tips/ToolCall/ToolGroup/AgentStatus/Plan/Thinking/AcpToolCall/...` variants plus the `TMessage` union. Exports `transformMessage` / `composeMessage` (IPC → typed message), merge helpers (`mergeAcpToolCallContent`, `mergeTextMessageContent`), agent-error normalizers, and the cross-platform `joinPath`. |
| `normalizeToolCall.ts`      | Flattens the three tool message shapes (`tool_group`, `acp_tool_call`, `tool_call`) into a unified `NormalizedToolCall` with a single `NormalizedToolStatus`. Entry points `normalizeToolMessages` and `hasRunningToolMessages`; builds human-readable param summaries per tool kind (read/edit/execute/search/glob/write).                                                                               |
| `normalizeToolCall.test.ts` | Vitest spec; currently asserts `normalizeToolCall` returns `undefined` when `call_id` is empty.                                                                                                                                                                                                                                                                                                           |
| `atCommandParser.ts`        | Parses `@<path>` file references out of a query string (`parseAllAtCommands`, `extractAtPaths`, `hasAtReferences`, `reconstructQuery`), handling backslash-escaped spaces and `.`-aware path termination.                                                                                                                                                                                                 |
| `imageGenCore.ts`           | Shared image-generation logic for both the built-in MCP image server and the legacy Gemini tool. Uses Node `fs`/`path` + OpenAI client; exports `executeImageGeneration`, `saveGeneratedImage`, `processImageUri`, MIME/base64 helpers, and a `jsonrepair`-backed `safeJsonParse`. **Main-process only** (Node APIs).                                                                                     |
| `sideQuestion.ts`           | `isSideQuestionSupported` — gates the "side question" feature to `type === 'acp'` + `backend === 'claude'` conversations.                                                                                                                                                                                                                                                                                 |

## Subdirectories

| Directory    | Purpose                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `approval`   | Tool-call / permission approval logic (see `approval/AGENTS.md`).           |
| `document`   | Document-related chat handling (see `document/AGENTS.md`).                  |
| `navigation` | Chat navigation helpers (see `navigation/AGENTS.md`).                       |
| `slash`      | Slash-command and available-command types/handling (see `slash/AGENTS.md`). |

## For AI Agents

- This directory is `common/`, shared by both processes. Most files are process-agnostic, but `imageGenCore.ts` imports `fs`/`path`/`openai` and must run in the **Main process only** — do not import it from renderer code.
- `chatLib.ts` is the schema hub: when adding a message type, extend `TMessageType`, define an `IMessage<...>` alias, add it to the `TMessage` union, and handle it in `transformMessage`/`composeMessage`. ACP/tool types are sourced from `@/common/types/platform/acpTypes` and `slash/types`.
- `normalizeToolCall.ts` uses local compat types (`AcpToolCallContentCompat`) to read both camelCase (`rawInput`) and snake_case (`raw_input`) fields — keep both when extending.
- This is non-UI logic: no Arco/i18n here. Comments mix English and Chinese, matching existing files; keep new comments in English per project convention.

## Dependencies

### Internal

`@/common/types/platform/acpTypes`, `@/common/chat/slash/types`, `@/common/config/storage`, `@/common/config/constants`, `@/common/api/ClientFactory`, `@/common/api/RotatingApiClient`, `../adapter/ipcBridge`, `../utils`

### External

`openai`, `jsonrepair`, `vitest` (test), Node `fs`/`path`

<!-- MANUAL: notes below this line are preserved on regeneration -->
