<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# team

## Purpose
Shared TypeScript type definitions for the multi-agent "team" feature, used by both the main process and renderer. Defines persisted team/agent records (SQLite-backed), the IPC events pushed to the renderer for runtime agent lifecycle and streaming, and the MCP injection pipeline status types.

## Key Files
| File | Description |
| --- | --- |
| `teamTypes.ts` | Core team types. Role/status/workspace unions (`TeammateRole`, `TeammateStatus`, `WorkspaceMode`), persisted records (`TeamAgent`, `TTeam`), and IPC event payloads (`ITeamAgentStatusEvent`, `ITeamAgentSpawnedEvent`, `ITeamMessageEvent`, `ITeamCreatedEvent`, `ITeamTeammateMessageEvent`, etc.). Also defines the MCP pipeline phase union `TeamMcpPhase` and `ITeamMcpStatusEvent`. |
| `database.ts` | Message-search DTOs (`IMessageSearchItem`, `IMessageSearchResponse`) referencing `TMessage` and `TChatConversation`; paginated search result shape. |

## For AI Agents
- These are pure type declarations in `common/` — shared by main and renderer, so do NOT import anything process-specific (no Node, no DOM, no `@process/*`/`@renderer/*` runtime code). `teamTypes.ts` explicitly notes renderer code should import from here rather than `@process/team/types`.
- `TeammateStatus` is the renderer-facing union (`pending|idle|active|completed|failed`); backend statuses (`idle|working|thinking|tool_use|completed|error`) are mapped via `teamMapper.toStatus()` — keep that mapping in sync when adding statuses.
- `TTeam.agents` is an inline array of `TeamAgent` persisted as part of the `teams` SQLite row; field names use snake_case to match backend/DB payloads.
- Comments must be in English (project convention); the existing JSDoc style on each type should be preserved.

## Dependencies
### Internal
- `database.ts` imports `TMessage` from `../../chat/chatLib` and `TChatConversation` from `../../config/storage`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
