<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Sider

## Purpose
Renderer-side left sidebar of the AionUi desktop/mobile shell. `index.tsx` assembles the toolbar, search/scheduled nav entries, scrollable history (lazy-loaded grouped conversations), team and cron sections, plus a footer. Supports a `collapsed` mode (icon-only with tooltips) and routes between the normal chat shell and the Settings sidebar.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | `Sider` root component. Wires `LayoutContext`, `AuthContext`, `ThemeContext`, routing (`useNavigate`/`useLocation`), and preview close. Lazy-loads `WorkspaceGroupedHistory` and `SettingsSider`; injects `TeamSiderSection` + `CronJobSiderSection` via `afterPinnedContent`. Handles new chat / settings toggle / scheduled nav / theme toggle / logout (Cmd+Shift+L). |
| `SiderItem.tsx` | Reusable sidebar row: leading icon (pushpin overlay when pinned), truncated name with tooltip, and a hover three-dot `Dropdown`+`Menu`. Exports `SiderItem`, `SiderItemProps`, `SiderMenuItem`. Menu trigger has `data-testid="sider-item-menu-trigger"`. |
| `SiderFooter.tsx` | Footer with settings/back toggle, optional Google logout button (`showLogout`), and a theme toggle shown only inside Settings while expanded. |
| `TeamSiderSection.tsx` | Collapsible "Teams" section listing teams from `useTeamList` with badge counts, pin/rename/delete menu actions, create-team modal, and per-team pinning persisted to `localStorage` (`team-pinned-ids`, `team-section-expanded`). |
| `SortableSiderEntry.tsx` | Thin `@dnd-kit/sortable` `useSortable` wrapper that applies drag transform/opacity to its children. |
| `siderOrder.ts` | Pure helpers for sidebar ordering: read/write/compare localStorage order, reconcile stored vs current ids, group-aware sort, and `reorderSiderIds` (uses `arrayMove`). |
| `useStoredSiderOrder.ts` | Hook around `siderOrder.ts`: persists order to a `storageKey`, exposes `orderedItems`/`orderedIds`/`sensors`/`handleDragEnd` with optional group constraint (drag blocked across groups). |
| `Sider.module.css` | New-chat icon press animation (reduced-motion aware), zero-width overlay scrollbar (`.scrollArea`), and pinned-row text-slot padding. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `SiderNav` | Top fixed nav entries: toolbar, search entry, scheduled entry (see `SiderNav/AGENTS.md`) |
| `CronJobSiderSection` | Scheduled/cron jobs section rendered in the scroll area (see `CronJobSiderSection/AGENTS.md`) |

## For AI Agents
- Renderer-only code: NO Node.js APIs. Cross-process calls go through `ipcBridge` from `@/common`.
- UI must use `@arco-design/web-react` (`Tooltip`, `Dropdown`, `Menu`, `Modal`, `Input`, `Message`) and `@icon-park/react` icons — no raw HTML controls. Styling is UnoCSS utilities + semantic tokens (`text-t-primary`, `bg-fill-3`, `var(--color-border-2)`); add complex styles to `Sider.module.css`.
- All user-facing text uses `useTranslation()` i18n keys (e.g. `common.settings`, `settings.googleLogout`).
- Collapsed mode is driven by the `collapsed` prop + `siderTooltipProps` from `@renderer/utils/ui/siderTooltip`; reuse `getSiderTooltipProps(tooltipEnabled)` rather than hand-rolling tooltips. Call `cleanupSiderTooltips()` and `blurActiveElement()` before navigation, as existing handlers do.
- Drag-and-drop ordering: keep ordering logic pure in `siderOrder.ts` and consume via `useStoredSiderOrder`; persistence is per-`storageKey` localStorage and cross-group drags are intentionally rejected.

## Dependencies
### Internal
`@/common` (ipcBridge), `@renderer/hooks/context/*` (Layout/Auth/Theme), `@renderer/pages/conversation/Preview/context`, `@renderer/pages/conversation/GroupedHistory`, `@renderer/pages/team/*`, `@renderer/pages/cron/useCronJobs`, `@renderer/pages/settings/components/SettingsSider`, `@renderer/utils/ui/*`, `@renderer/styles/colors`.
### External
`react`, `react-router-dom`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`, `classnames`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `swr`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
