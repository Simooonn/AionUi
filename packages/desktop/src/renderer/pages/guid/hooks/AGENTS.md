<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose

React hooks and helpers backing the Guid (new-conversation) page: agent/assistant selection, model selection, input/file handling, the `@`-mention picker, preset assistant resolution, and conversation creation (send). `useGuidAgentSelection` and `useGuidSend` are the large orchestrators; the rest are focused sub-hooks they compose.

## Key Files

| File                            | Description                                                                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGuidAgentSelection.ts`      | Top-level agent-selection orchestrator. Composes `usePresetAssistantResolver`, `useAgentAvailability`, `useCustomAgentsLoader`; manages `selectedAgentKey`/mode/ACP-model state and exposes `getAgentKey`, `findAgentByKey`, and preset/skill resolvers.  |
| `useGuidSend.ts`                | Builds conversation-create params and submits ACP / Aion CLI conversations via `ipcBridge`, then navigates. Takes a large `GuidSendDeps` bag wiring input, agent, MCP, and mention state. Returns `handleSend`, `sendMessageHandler`, `isButtonDisabled`. |
| `useGuidInput.ts`               | Input/file state: text, attached `files`, workspace `dir`, focus, loading. Integrates `useDragUpload` + `usePasteService` (drag/paste append files; text paste inserts at caret).                                                                         |
| `useGuidMention.ts`             | `@` mention picker: builds `mentionOptions` from `availableAgents` (label tokens, avatar/logo resolution), filters by query, manages open/active-index state, and `selectMentionAgent` strips the token and sets the agent.                               |
| `useGuidModelSelection.ts`      | Provider/model list (filtered by `hasAvailableModels`) and default-model persistence per agent key (currently `aionrs` → `aionrs.defaultModel`). Exposes `current_model`, `setCurrentModel`, `isGoogleAuth`.                                              |
| `usePresetAssistantResolver.ts` | Resolves a preset assistant's rules/skills/context/`preset_agent_type` and enabled/disabled skills from the backend-merged `Assistant[]` catalog (rules/skills read via `ipcBridge.fs.read*`).                                                            |
| `useAgentAvailability.ts`       | `isMainAgentAvailable` (gemini checks Google auth or model list; others check `availableAgents`) and `getEffectiveAgentType`.                                                                                                                             |
| `useCustomAgentsLoader.ts`      | Loads two distinct lists via SWR: preset `assistants` (`ipcBridge.assistants.list`) and ACP `customAgents` (filtered `agent_source==='custom'` from `useAgents`), plus an id→avatar map and `refreshCustomAgents`.                                        |
| `agentSelectionUtils.ts`        | Pure helpers: `getAgentKey` (row-scoped custom/remote use `id`, else `backend`/`agent_type`) and `configService` writers `savePreferredMode`, `savePreferredModelId`, `saveAionrsDefaultModel`.                                                           |
| `useTypewriterPlaceholder.ts`   | Typewriter animation for placeholder text (80ms/char, blinking `\|` cursor, 300ms initial delay).                                                                                                                                                         |

## For AI Agents

- Renderer process only — no Node.js APIs. All main-process work goes through `ipcBridge` (`@/common`) and persistence through `configService`.
- Two assistant-shaped lists are intentionally kept distinct and must not be conflated: `assistants: Assistant[]` (prompt presets) vs `customAgents: AgentMetadata[]` (ACP CLI engine rows). See the long comment in `useCustomAgentsLoader.ts`.
- Agent identity flows through `getAgentKey` (`agentSelectionUtils.ts`); reuse it rather than re-deriving keys. Note preset _assistants_ use a separate `custom:<assistantId>` form produced by `AssistantSelectionArea`, not `AgentRegistry`.
- Data fetching uses SWR with shared keys (`'assistants.list'`, `DETECTED_AGENTS_SWR_KEY`) so multiple consumers issue one request — don't add per-mount refresh effects.
- `agentInfo`-shaped params are passed as inline structural object types throughout; keep those signatures aligned across the resolver/availability/send hooks.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/config/configService`, `@/common/config/storage`, `@/common/types/agent`, `@/common/types/codex`, `@/common/utils/buildAgentConversationParams`
- `@/renderer/hooks/agent/*`, `@/renderer/hooks/file/*`, `@/renderer/hooks/mcp/catalog`, `@/renderer/utils/model/*`, `@/renderer/services/FileService`
- `../types`, `../constants`, `../utils/caretUtils`, `../utils/modelUtils`

### External

- `react`, `swr`, `@arco-design/web-react`, `react-router-dom`, `i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
