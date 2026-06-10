<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose
Renderer UI components for AionUi's team mode: the create-team modal, the per-agent tab bar, the chat-view router that picks the right platform chat, the greeting empty state, and the shared agent identity/avatar primitives. These render multi-agent ("team") conversations where a leader spawns teammates.

## Key Files
| File | Description |
| --- | --- |
| `TeamCreateModal.tsx` | "Create Team" modal: name input, leader-agent radio list (CLI agents + preset assistants, searchable), workspace folder picker. Calls `ipcBridge.team.create.invoke`. Marked `[E2E SYNC]` — DOM/class/testid changes must be mirrored in `tests/e2e/cases/teams/`. |
| `TeamTabs.tsx` | Tab bar for team agents. Contains inner `TeamTabView` (drag-reorder, double-click rename, remove, status badge, pending-permission `‼️` marker) and `TeamTabs` (scroll-overflow fade indicators). Reads state from `useTeamTabs()`. Leader tab is fixed at index 0 and not draggable. |
| `TeamChatView.tsx` | Routes a conversation to `AcpChat` / `AionrsChat` / `LegacyReadOnlyConversation` (all `React.lazy`) by `conversation.type`. Does NOT wrap in ChatLayout. Injects `TeamChatEmptyState` as `emptySlot` when `team_id` is set. Inner `AionrsTeamChat` wires aionrs model selection. |
| `TeamChatEmptyState.tsx` | Greeting shown before first message: agent avatar/name plus leader-only prompt suggestions (debate / interview / expert_review) that fill the send-box draft store. Reads team_id/backend/preset info from the SWR-cached conversation. |
| `TeamAgentIdentity.tsx` | Shared avatar + name (+ leader crown SVG) row. Resolves avatar from preset emoji/svg, explicit icon, backend logo, or first-letter fallback. |
| `AgentStatusBadge.tsx` | 2px colored dot keyed off `TeammateStatus` (active = green + pulse, failed = red, else gray). |
| `agentSelectUtils.tsx` | `TeamAgentOption` type unifying CLI agents and preset assistants; mappers (`cliAgentToOption`, `assistantToOption`), key helpers, `filterTeamSupportedAgents` (team_capable + non-deprecated), `resolveConversationType`, and the `AgentOptionLabel` dropdown row. |
| `teamCreateModelResolver.ts` | `resolveDefaultTeamAgentModel` — picks a concrete model ID per backend (ACP handshake, gemini `auto`, aionrs config default) so `POST /api/teams` never persists `use_model: null`. See header comment / mnemo #297. |

## For AI Agents
- Renderer-only: no Node.js APIs. Cross-process work goes through `ipcBridge` (`@/common`).
- `TeamCreateModal.tsx` is E2E-coupled — preserve `data-testid` attributes and the `[E2E SYNC]` comment when editing.
- `TeamChatEmptyState` and `TeamAgentIdentity` intentionally reuse the SWR key `['team-conversation', conversation_id]` (shared with `AgentChatSlot`) to hit cache instead of re-fetching — keep this key stable.
- Avatar resolution order is duplicated across `TeamAgentIdentity`, `TeamChatEmptyState`, and `AgentOptionLabel` (preset → explicit icon → backend logo → letter); keep them consistent.
- Colors use semantic tokens / CSS vars (`var(--aou-6)`, `bg-fill-2`, `text-t-secondary`) — no hardcoded hex. User-facing strings use `t(...)` with `defaultValue`.
- Note: `TeamCreateModal` and `TeamTabs` use raw `<input>` for the inline search/rename fields rather than Arco `Input` — an exception to the no-raw-HTML convention.

## Dependencies
### Internal
- `../hooks/TeamTabsContext` (`useTeamTabs`)
- `@/common` (ipcBridge), `@/common/types/team/teamTypes`, `@/common/config/storage`, `@/common/config/configService`
- `@renderer/pages/conversation/*` (platform chats, `useConversationAgents`, conversation cache/runtime helpers)
- `@renderer/hooks/agent/*`, `@renderer/utils/model/*` (agentLogo, agentTypeSupportPolicy), `@renderer/utils/platform`
- `@renderer/components/base/AionModal`, `@renderer/components/workspace`, `@renderer/pages/guid/*`
### External
- `react`, `react-i18next`, `swr`
- `@arco-design/web-react` (Button, Form, Input, Message, Spin, Tooltip)
- `@icon-park/react` (Close, Search, Edit, CloseSmall, Robot)

<!-- MANUAL: notes below this line are preserved on regeneration -->
