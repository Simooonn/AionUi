<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose

Renderer-side React hooks and context providers powering the team (multi-agent) UI: agent tab state, live session/status sync over IPC, pending-permission badge counts, and team-creation redirects. All state derives from `ipcBridge.team`/`ipcBridge.conversation` events plus SWR caches.

## Key Files

| File                           | Description                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TeamTabsContext.tsx`          | `TeamTabsProvider` / `useTeamTabs`. Holds agent list, `activeSlotId`, status map; keeps leader first and persists teammate order + active slot in `localStorage` (`team-agent-order-*`, `team-active-slot-*`). Exposes `switchTab`, `reorderAgents`, optional `renameAgent`/`removeAgent`. |
| `TeamPermissionContext.tsx`    | `TeamPermissionProvider` / `useTeamPermission` (returns `null` outside a team). Tracks leader vs member agents, propagates permission `mode` to all agents via `team.setSessionMode`, and provides idempotent `warmupSession` (`team.ensureSession`).                                      |
| `useTeamSession.ts`            | Subscribes to `agentStatusChanged/Spawned/Removed/Renamed` IPC events for one team, maintaining a slot→status map and SWR-backed team data; returns `addAgent`/`renameAgent`/`removeAgent` mutators.                                                                                       |
| `useTeamList.ts`               | SWR list of teams for the current user (`useAuth`), revalidated on `team.listChanged`/`team.created`; `removeTeam` also clears the per-team active-slot key.                                                                                                                               |
| `useTeamPendingPermissions.ts` | Per-conversation pending-confirmation counts for one team; seeds from `localStorage` + backend `confirmation.list`, syncs via `confirmation.add/remove`, returns `totalPending` and `clearStorage`.                                                                                        |
| `useSiderTeamBadges.ts`        | Aggregates pending-confirmation counts per team ID for the sidebar badge; seeds from team agent summaries, updates live via confirmation IPC events keyed by a team signature string.                                                                                                      |
| `useTeamCreatedRedirect.ts`    | Listens for `team.listChanged` (action `created`) / `team.created`, refreshes chat history via `emitter`, and navigates to `/team/<id>`.                                                                                                                                                   |

## For AI Agents

- Renderer process only: NO Node.js APIs. All cross-process calls go through `ipcBridge` (`@/common`); subscriptions return unsubscribe fns — always clean up (several use `removeStack` from `@/renderer/utils/common`).
- `useTeamPermission` intentionally returns `null` for standalone (non-team) conversations; gate all team-only logic behind that null check.
- Effects deliberately depend on a derived signature string (e.g. `teamSignature`, `conversation_ids.join(',')`) with `eslint-disable-next-line react-hooks/exhaustive-deps`; preserve this pattern rather than spreading raw arrays/maps.
- `localStorage` keys are conventionally team-scoped: `team-active-slot-<id>`, `team-agent-order-<id>`, `team-pending-permissions-<id>`. Keep prefixes consistent and prune/clear on team removal.
- `useTeamTabs` throws if used outside its provider; `useTeamPermission` does not.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/types/team/teamTypes`
- `@renderer/hooks/context/AuthContext`, `@renderer/components/layout/Sider/siderOrder`, `@/renderer/utils/common`, `@/renderer/utils/emitter`

### External

- `react`, `swr`, `react-router-dom`

<!-- MANUAL: notes below this line are preserved on regeneration -->
