<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# guid

## Purpose

The "Guid" (welcome / new-conversation entry) page of the renderer. `GuidPage.tsx` is the composed landing screen where the user picks an agent, assistant, and model, types a first prompt with `@` mentions, toggles skills/MCP servers, and starts a conversation. This directory holds that top-level page plus its shared constants and types; the heavy logic lives in `hooks/` and the UI in `components/`.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GuidPage.tsx`     | ~820-line top-level page component (default export). Wires together the Guid hooks (agent/model/mention/input/send selection, typewriter placeholder) and renders `AgentPillBar`, `GuidInputCard`, `AssistantSelectionArea`, `MentionDropdown`, `GuidModelSelector`, `GuidActionRow`, `QuickActionButtons`, and `FeedbackReportModal`. Manages skills + MCP server selection state and the input focus ring. |
| `index.tsx`        | Barrel re-exporting `GuidPage` as default.                                                                                                                                                                                                                                                                                                                                                                   |
| `types.ts`         | Page-scoped types: `AvailableAgent` (backend agent entry, discriminated by `agent_type`/`backend`), `MentionOption` (computed `@` dropdown entry), `EffectiveAgentInfo`; re-exports `AcpModelInfo`.                                                                                                                                                                                                          |
| `constants.ts`     | `CUSTOM_AVATAR_IMAGE_MAP` — maps custom avatar identifiers (e.g. `cowork.svg`, the 🛠️ emoji) to resolved image URLs.                                                                                                                                                                                                                                                                                         |
| `index.module.css` | CSS Module styles for the page (~21 KB).                                                                                                                                                                                                                                                                                                                                                                     |

## Subdirectories

| Directory    | Purpose                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components` | Presentational sub-components of the Guid page (pill bar, input card, model selector, mention dropdown, action row, etc.) (see `components/AGENTS.md`) |
| `hooks`      | Guid-specific React hooks holding the page's logic: agent/model/mention selection, input, send, typewriter placeholder (see `hooks/AGENTS.md`)         |
| `utils`      | Helper functions used by the Guid page and its hooks (see `utils/AGENTS.md`)                                                                           |

## For AI Agents

- Renderer process: no Node.js APIs. Cross-process calls go through `ipcBridge` from `@/common`; external links open via `openExternalUrl` (renderer platform util), never `window.open` to a Node API.
- `GuidPage.tsx` is already large — add new logic to a hook under `hooks/` or a component under `components/`, not inline here.
- `types.ts`: prefer `id` over the `@deprecated` `custom_agent_id` when identifying agents. `agent_type` is the discriminant; `backend` is only set when `agent_type === 'acp'`.
- New avatar identifiers must be registered in `CUSTOM_AVATAR_IMAGE_MAP`, not hardcoded in components.
- All user-facing strings use i18n (`useTranslation`); colors/styles via `index.module.css` or UnoCSS tokens — no hardcoded values.

## Dependencies

### Internal

`@/common` (ipcBridge, config/storage, utils), `@/renderer/hooks` (chat input focus ring, mcp catalog), `@/renderer/utils` (platform, model agentLogo/agentTypes), `@/common/types` (agent, platform/acp)

### External

`react`, `react-i18next`, `react-router-dom`, `swr`, `@arco-design/web-react`, `@icon-park/react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
