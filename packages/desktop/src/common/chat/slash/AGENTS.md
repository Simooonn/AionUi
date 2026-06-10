<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# slash

## Purpose
Shared types and pure helpers for the slash-command autocomplete feature in chat input. Defines the `SlashCommandItem` model, normalizes raw ACP command payloads (both websocket and HTTP shapes) into that model, and decides whether the slash menu should be enabled for a given conversation type.

## Key Files
| File | Description |
| --- | --- |
| `types.ts` | Type definitions: `SlashCommandItem` (the autocomplete model), `SlashCommandKind` (`template`/`builtin`), `SlashCommandSource` (`acp`/`builtin`), selection/completion behavior unions, and the two raw ACP payload shapes `AcpAvailableCommand` (websocket `available_commands` with nested `_meta`/`input`) and `AcpSlashCommandApiItem` (HTTP `/slash-commands` endpoint). |
| `acpMapping.ts` | `mapAcpCommandToSlashCommand` / `mapAcpCommandsToSlashCommands`: normalize either ACP payload variant into `SlashCommandItem`, reconciling snake_case vs camelCase fields and websocket vs HTTP locations for hint, completion behavior, and empty-turn tip code/params. Always emits `kind: 'template'`, `source: 'acp'`, `selectionBehavior: 'insert'`. |
| `availability.ts` | `isSlashCommandListEnabled`: returns true only for `acp` and `aionrs` conversation types; for `codex` requires `codexStatus === 'session_active'`. Avoids hitting the backend `/slash-commands` endpoint for agents that return empty (gateway/nanobot/remote). |

## For AI Agents
- This lives under `common/` so it is shared by both main and renderer processes — keep it pure/isomorphic with NO DOM or Node.js APIs.
- Mapping helpers must stay resilient to both raw payload variants: `isHttpSlashCommand` discriminates on the presence of the `command` key (HTTP) vs `name` (websocket). When adding a field, handle both snake_case and camelCase HTTP aliases plus the websocket `_meta` location, as the existing getters do.
- Optional fields are spread conditionally (`...(hint ? { hint } : {})`) to keep them absent rather than `undefined`; follow that pattern when extending the output object.
- Behavior unions are narrowed via `normalizeCompletionBehavior` before use — do not pass arbitrary strings through to `SlashCommandItem`.

## Dependencies
### Internal
`acpMapping.ts` imports types from `./types`. No other in-repo imports.

<!-- MANUAL: notes below this line are preserved on regeneration -->
