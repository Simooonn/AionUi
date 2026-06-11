<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# team

## Purpose

Renderer route for the multi-agent "team" workspace, where several AI agents (one leader + members) run side-by-side, each with its own conversation. Renders the agent grid, tab bar, per-agent chat panes, fullscreen toggle, and a shared workspace file sider.

## Key Files

| File           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`    | Route entry. Reads `:id` from the URL, fetches the team via `ipcBridge.team.get` with SWR, shows a `Spin` while loading, then renders `TeamPage` keyed by team id.                                                                                                                                                                                                                                                                                                                                                                                              |
| `TeamPage.tsx` | Main page. `TeamPage` wires `useTeamSession` (status/rename/remove/mutate), auth, and team-rename via `ipcBridge.team.renameTeam`, then wraps children in `TeamTabsProvider`. Inner `TeamPageContent` lays out the scrollable agent grid (`AgentChatSlot` per agent), scroll arrows, fullscreen state, remove-agent confirm flow, and the workspace `ChatSlider` sider. Local helpers `AgentChatSlot` (per-agent conversation fetch + header model selector) and `AionrsHeaderModelSelector` (compact aionrs model picker that updates the conversation model). |

## Subdirectories

| Directory    | Purpose                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components` | Presentational sub-components: tabs, chat view, agent identity header, etc. (see `components/AGENTS.md`)                                          |
| `hooks`      | Team-scoped contexts and hooks: `useTeamSession`, `TeamTabsContext`, `TeamPermissionContext`, `useTeamPendingPermissions` (see `hooks/AGENTS.md`) |

## For AI Agents

- Renderer process only — no Node.js APIs. All team/conversation reads & writes go through `ipcBridge` (`team.get`, `team.removeAgent`, `team.renameTeam`, `conversation.update`).
- Data fetching uses `useSWR`; agent conversations are loaded with the `['team-conversation', conversation_id]` key via `getConversationOrNull` (conversation cache), not a direct IPC call. Reuse the same key when invalidating.
- Agent roles: `leader` vs member. The leader's conversation drives the workspace sider; `effectiveWorkspace` falls back to the leader's temp workspace when `team.workspace` is unset (`isTeamWorkspaceTemporary`).
- Removing an `active` agent prompts a `Modal.confirm`; inactive agents are removed directly. Two remove paths exist (`TeamPage.handleRemoveAgentWithConfirm` and `TeamPageContent.handleRemoveAgent`) — keep their confirm logic in sync.
- Conversation type drives the model selector: `aionrs` uses `AionrsModelSelector`; `acp`/`codex` use `AcpModelSelector`.
- Use i18n keys (`t('team.*')`, `t('common.*')`, `t('conversation.workspace.*')`); never hardcode UI strings. Colors via semantic CSS vars (`--color-primary-6`, `--color-bg-1`, `--border-base`).

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/types/team/teamTypes`, `@/common/config/storage` (types)
- `@renderer/hooks/context` (`AuthContext`, `LayoutContext`)
- `@/renderer/pages/conversation` (`ChatLayout`, `ChatSlider`, `conversationCache`, aionrs platform selectors)
- `@/renderer/components/agent/AcpModelSelector`, `@/renderer/pages/guid/hooks/agentSelectionUtils`
- `./components/*`, `./hooks/*`

### External

- `react`, `react-router-dom` (`useParams`), `react-i18next`, `swr`
- `@arco-design/web-react` (`Spin`, `Message`, `Modal`), `@icon-park/react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
