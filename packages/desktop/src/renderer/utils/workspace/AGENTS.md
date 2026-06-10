<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# workspace

## Purpose
Renderer-side helpers for the conversation workspace panel: deriving a display name from a workspace path, broadcasting workspace UI events over `window` CustomEvents, and persisting per-workspace last-update timestamps in `localStorage`.

## Key Files
| File | Description |
| --- | --- |
| `workspace.ts` | `getWorkspaceDisplayName(path, isTemporaryWorkspace, t?)` returns the localized "Temporary Session" label when temporary, else the last path segment; `getLastDirectoryName(path)` extracts the final segment. Splits on `[\\/]+`. The temporary flag must be supplied by the caller (from `conversation.extra.is_temporary_workspace`), never guessed from path shape. |
| `workspaceEvents.ts` | Defines event name constants (`WORKSPACE_TOGGLE_EVENT`, `WORKSPACE_STATE_EVENT`, `WORKSPACE_HAS_FILES_EVENT`), the `WorkspaceStateDetail` / `WorkspaceHasFilesDetail` types, and `dispatch*` functions that fire typed `CustomEvent`s on `window`. `WorkspaceHasFilesDetail.isInitial` flags the tree's first load to distinguish backend-seeded files from mid-session additions. |
| `workspaceHistory.ts` | `getWorkspaceUpdateTime` / `updateWorkspaceTime` read and write a `Record<string, number>` map under the `aionui_workspace_update_time` `localStorage` key, tracking each workspace's last-update time (set on new-conversation creation). |

## For AI Agents
- Renderer-only: these files use `window`, `localStorage`, and `CustomEvent` — never Node.js APIs. `workspaceEvents.ts` guards every dispatch with `typeof window === 'undefined'` for safety, mirror that pattern if adding new dispatchers.
- Event flow is decoupled: dispatchers here fire `CustomEvent`s; listeners live elsewhere in the renderer. When adding an event, export both the name constant and a typed detail interface, and pair `dispatch*` with a typed `CustomEvent<TDetail>`.
- `workspaceHistory.ts` wraps all JSON parse/write in try/catch and falls back to `0` / `{}` on error — preserve that defensive handling. Don't assume the `localStorage` value is well-formed.
- i18n: `getWorkspaceDisplayName` takes an optional `t` translator; only the `conversation.workspace.temporarySpace` key is used, with an English literal fallback.

## Dependencies
### Internal
None evident — these files are self-contained renderer utilities.
### External
None — relies only on browser globals (`window`, `localStorage`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
