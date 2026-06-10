<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ChatLayout

## Purpose
The top-level chat page shell. `ChatLayout` composes the header (title editor + agent badge + injected actions), the main chat content area, an optional resizable preview panel, and a collapsible right-side workspace panel. It handles desktop/mobile branching, drag-to-resize splits, and platform-specific (mac/Windows/Linux) workspace toggle placement.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | `ChatLayout` component (default export). Orchestrates layout via hooks (`useWorkspaceCollapse`, `useContainerWidth`, `useTitleRename`, `useResizableSplit` ×2, `useLayoutConstraints`) and `calcLayoutMetrics`. Renders one unified DOM tree (chat + preview kept mounted across preview toggle to avoid remount), the desktop header, and conditional workspace/preview panels. Portals `headerExtra` into `#app-titlebar-actions-slot` on mobile. |
| `WorkspacePanelHeader.tsx` | Compact header bar for the workspace side panel: optional collapse toggle (`ExpandLeft`/`ExpandRight`) with `left`/`right` placement, slotted title, and `WorkspaceOpenButton`. Also exports named `DesktopWorkspaceToggle` (floating expand button shown when panel is collapsed on desktop). |
| `WorkspaceOpenButton.tsx` | Split button + dropdown to open the workspace folder in VS Code / Terminal / File Explorer via `ipcBridge.shell`. Persists preferred tool in `localStorage` (`workspace-open-preference`); hides in WebUI/browser mode and for temporary workspaces. |
| `MobileWorkspaceOverlay.tsx` | Mobile-only overlay: dimmed backdrop, fixed full-height workspace panel (slides via `translateX`), and a floating collapse handle. |
| `chat-layout.css` | Header glass/blur effect (`--glass`), mobile unified header, workspace-open dropdown styling, and mobile header pill rules. |

## For AI Agents
- Renderer process only — no Node.js APIs. Folder-open actions go through `ipcBridge.shell.*` (preload bridge), never direct fs/child_process.
- Workspace collapse/toggle is event-driven: fire `dispatchWorkspaceToggleEvent()` rather than calling setters directly across components.
- Platform branching is explicit: `isMacEnvironment`/`isWindowsEnvironment` decide whether the in-panel toggle vs the header toggle is shown; keep all three (mac, Windows, Linux/default) paths consistent when editing toggles.
- Layout sizes come from constants in `utils/layoutCalc` (`*_WORKSPACE_PANEL_PX`, `WORKSPACE_HEADER_HEIGHT`) — reuse them, don't hardcode.
- This file uses raw `<button>` elements with `workspace-header__toggle` styling rather than Arco `Button` (existing convention here); icons are `@icon-park/react`.
- Keep chat + preview in the single unified DOM tree (toggle via flex/`display`), not conditional mount/unmount, to preserve child component state.

## Dependencies
### Internal
- `@/common` (ipcBridge), `@/renderer/components/agent/AgentBadge`, `@/renderer/components/layout/FlexFullContainer`, `@/renderer/hooks/context/LayoutContext`, `@/renderer/hooks/ui/useResizableSplit`, `@/renderer/hooks/agent/usePresetAssistantInfo`
- `@/renderer/pages/conversation/components/ChatTitleEditor`, `../../hooks/*` (`useContainerWidth`, `useLayoutConstraints`, `useTitleRename`, `useWorkspaceCollapse`, `useConversationAgents`), `../../Preview` (`PreviewPanel`, `usePreviewContext`), `../../utils/{layoutCalc,detectPlatform}`
- `@/renderer/utils/workspace/workspaceEvents`, `@/renderer/utils/platform`

### External
- `@arco-design/web-react` (Layout, Button, Dropdown, Tooltip), `@icon-park/react`, `react` / `react-dom` (`createPortal`), `react-i18next`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
