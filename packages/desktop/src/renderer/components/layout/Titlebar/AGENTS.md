<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Titlebar

## Purpose

The custom application title bar rendered at the top of the app shell. It adapts across runtimes (Windows/Linux desktop, macOS desktop, and WebUI/mobile), hosting the sidebar toggle, browser-style back/forward history navigation, a centered brand/conversation title, the workspace panel toggle, and (on Windows/Linux) custom window controls.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                   | `Titlebar` component (default export). Computes runtime-specific button visibility (`showSiderToggle`, `showHistoryNav`, `showWorkspaceButton`, `showWindowControls`), wires sidebar/workspace toggles, back-to-chat (settings exit), and history nav. Includes inline `SidebarIcon` SVG (Claude-desktop-style panel icon) and dynamically measures left/right groups via `ResizeObserver` to center the mobile title. |
| `MobileConversationBrand.tsx` | Mobile-only brand element for conversation routes. Loads the conversation via `ipcBridge.conversation.get` (SWR) plus preset assistant info, derives the `backend` from `conversation.type`, and renders an `AgentLogoIcon` + conversation name.                                                                                                                                                                       |
| `titlebar.css`                | All title-bar styling, keyed by runtime modifier classes (`--desktop`, `--mac`, `--mobile`, `--mobile-conversation`). Defines drag regions (`-webkit-app-region`), button/window-control sizing, and the `--app-titlebar-mobile-center-offset` centering variable.                                                                                                                                                     |

## For AI Agents

- Renderer-only code: no Node.js APIs. All main-process data comes through `ipcBridge` (e.g. `ipcBridge.conversation.get`, `ipcBridge.team.get`).
- Drag behavior is CSS-driven: the bar sets `-webkit-app-region: drag` (desktop) and interactive groups (`__menu`, `__toolbar`, `__button`) opt back out with `no-drag`. Keep that invariant when adding clickable elements.
- Visibility is platform-conditional via `isElectronDesktop()`/`isMacOS()`: macOS reserves space for traffic lights (`menuStyle` margin-left `76px`) and shows the workspace toggle in-bar, while Windows/Linux render `<WindowControls />` instead.
- Raw `<button>`/inline SVG are intentional here (chrome-level UI sitting outside Arco theming) — this is an exception to the no-raw-HTML rule, not a pattern to copy elsewhere.
- All tooltips/labels go through `t(...)` with `defaultValue`; the inline comments mixing Chinese/English follow the repo convention (English for code comments).

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/config/constants` (`TEAM_MODE_ENABLED`)
- `../WindowControls`, `@renderer/utils/workspace/workspaceEvents`, `@renderer/utils/platform`
- `@/renderer/hooks/context/LayoutContext`, `@/renderer/hooks/context/NavigationHistoryContext`
- `@/renderer/components/agent/AgentBadge` (`AgentLogoIcon`), `@/renderer/hooks/agent/usePresetAssistantInfo`

### External

- `react`, `react-router-dom`, `react-i18next`, `classnames`, `@icon-park/react`, `swr`

<!-- MANUAL: notes below this line are preserved on regeneration -->
