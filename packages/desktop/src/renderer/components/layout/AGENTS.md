<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# layout

## Purpose
App-shell layout primitives for the renderer: the top-level router, the main `Layout` (sider + content frame with responsive/mobile and drag-to-collapse behavior), window chrome controls, and global hosts (loader, installation-integrity modal, PWA pull-to-refresh). These compose the outer frame inside which every page route renders.

## Key Files
| File | Description |
| --- | --- |
| `Layout.tsx` | Main app frame wrapping an Arco `Layout` with a draggable/collapsible `sider` and an `Outlet` content area. Handles mobile detection (`detectMobileViewportOrTouch`), sider drag snap/hysteresis, tray-event navigation, deep links, notification clicks, conversation shortcuts, dev-tools triple-click (`useDebug`), bridges Main-process logs to the F12 console, and lazy-mounts `UpdateModal`. Provides `LayoutContext` + `NavigationHistoryProvider`. |
| `Router.tsx` | `PanelRoute` — `HashRouter` route table. Lazy-loads page modules, gates routes behind `useAuth` via `ProtectedLayout` (redirects unauthenticated users to `/login`, `checking` shows `AppLoader`), redirects legacy paths, and gates `/team/:id` behind `TEAM_MODE_ENABLED`. |
| `WindowControls.tsx` | Custom minimize/maximize/restore/close buttons driving `ipcBridge.windowControls.*`; subscribes to `maximizedChanged` and hides itself when the IPC interface is unavailable (non-desktop). |
| `InstallationIntegrityDialog.tsx` | Helpers + `InstallationIntegrityModalHost` showing an unclosable Arco error modal when a backend/runtime component is missing; "download latest" opens aionui.com. All text via i18n `common.backendStartup.incompleteInstallation.*`. |
| `PwaPullToRefresh.tsx` | Touch-only pull-to-refresh for iOS PWA standalone mode (gated by `usePwaMode`); reloads on a 70px downward pull from page top. Renders `null`. |
| `AppLoader.tsx` | Full-viewport centered Arco `Spin` fallback used as Suspense/route loader. |
| `FlexFullContainer.tsx` | Tiny wrapper giving children `flex-1 min-h-0` + an absolutely-filled inner div, for scroll/overflow-safe panels. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `Sider` | Sidebar navigation, session list, and related controls (see `Sider/AGENTS.md`). |
| `Titlebar` | Custom window titlebar / drag region and toolbar (see `Titlebar/AGENTS.md`). |

## For AI Agents
- Renderer process: NO Node.js APIs. All native/window/system interaction goes through `ipcBridge` (`@/common`), never `require`/`fs`.
- DOM/touch listeners in `PwaPullToRefresh` and the sider drag logic in `Layout` rely on `.layout-content` and styles from `@renderer/styles/layout.css`; keep that class in sync.
- Team-mode routes/paths must stay guarded by `TEAM_MODE_ENABLED` (from `@/common/config/constants`) — see both `Router.tsx` and `Layout.tsx`.
- New top-level pages register as `React.lazy` + `withRouteFallback` in `Router.tsx`; add legacy-path redirects there rather than in pages.
- All user-facing strings use i18n keys; mobile breakpoints are hardcoded constants in `Layout.tsx` (768/1024, `DEFAULT_SIDER_WIDTH=260`).

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/config/constants`
- `@renderer/hooks/context/*` (Layout, NavigationHistory, Auth), `@renderer/hooks/system/*`, `@renderer/hooks/ui/useConversationShortcuts`, `@renderer/hooks/file/useDirectorySelection`
- `@renderer/utils/platform`, `@renderer/utils/ui/siderTooltip`, `@renderer/styles/layout.css`
- `@renderer/pages/*` (lazy routes), `@/renderer/components/settings/UpdateModal`
- Sibling `Titlebar`, `PwaPullToRefresh`
### External
- `react`, `react-router-dom` (`HashRouter`, `Outlet`, `Navigate`), `@arco-design/web-react` (`Layout`, `Modal`, `Spin`, `Typography`), `@icon-park/react`, `react-i18next`, `i18next`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
