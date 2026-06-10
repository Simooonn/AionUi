<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# workspace

## Purpose
Renderer UI for selecting a workspace/project folder. Provides a custom dropdown trigger (`WorkspaceFolderSelect`) that lists recently-used workspaces and opens the native directory picker, plus `localStorage`-backed helpers for tracking recent paths.

## Key Files
| File | Description |
| --- | --- |
| `WorkspaceFolderSelect.tsx` | `React.FC` folder-select control. Renders a fixed-position dropdown menu with viewport-aware placement (`updateMenuPosition`, opens above/below based on available space), recent-workspace list, and a "browse" action that invokes `ipcBridge.dialog.showOpen` with `openDirectory`/`createDirectory`. On non-desktop platforms falls back to a plain Arco `Input`. |
| `recentWorkspaces.ts` | `localStorage` helpers `getRecentWorkspaces`/`addRecentWorkspace` keyed by `DEFAULT_RECENT_WS_KEY` (`'aionui:recent-workspaces'`); caps the list at 5 (`MAX_RECENT_WORKSPACES`), dedupes, and prepends the newest path. All reads/writes are wrapped in try/catch. |
| `index.ts` | Barrel re-exporting `WorkspaceFolderSelect`, the two recent-workspace helpers, and `DEFAULT_RECENT_WS_KEY`. |

## For AI Agents
- Renderer-only code: no Node.js APIs. The native folder dialog is reached through `ipcBridge.dialog.showOpen.invoke(...)`, never via direct FS access.
- Desktop-vs-web is gated with `isElectronDesktop()` from `@renderer/utils/platform`; keep the `<Input>` fallback for the non-desktop branch.
- All user-facing strings (`placeholder`, `recentLabel`, `chooseDifferentLabel`, etc.) are passed in as props — this component holds no i18n keys itself; callers own translation.
- Styling uses UnoCSS utility classes with semantic tokens (`text-t-*`, `bg-fill-*`, `border-border-*`, `aou-*`); some computed/inline styles (fixed positioning, shadows, `isolation: isolate`) are unavoidable for the floating menu.
- The dropdown is hand-rolled (not Arco `Dropdown`): it uses `position: fixed` with manually computed `menuPos` and a `mousedown` outside-click listener. Re-uses `recentWorkspaces.length` in `estimateMenuHeight` for placement; update that estimate if row layout changes.
- `triggerTestId`/`menuTestId` props exist for test hooks — preserve them.

## Dependencies
### Internal
- `@/common` (`ipcBridge`)
- `@renderer/utils/platform` (`isElectronDesktop`)
### External
- `react`
- `@arco-design/web-react` (`Input`)
- `@icon-park/react` (`Check`, `Close`, `Down`, `FolderClose`, `FolderOpen`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
