<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# SettingsModal

## Purpose

The global app settings dialog rendered as an Arco Modal. Hosts built-in setting tabs (model, tools, webui, system, about) plus dynamically registered extension tabs in a responsive sidebar/tab layout, and exposes a hook for opening it from anywhere in the renderer.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`               | Default export `SettingsModal`; also exports `SubModal` (secondary dialog), and types `BuiltinSettingTab` / `SettingTab`. Builds the menu (built-in tabs + anchored/unanchored extension tabs), responsive mobile-tabs vs desktop-sidebar layout, lazy-mounts/keep-alives extension tab content, and routes built-in tabs to `contents/` components. |
| `useSettingsModal.tsx`    | `useSettingsModal()` hook returning `{ openSettings, closeSettings, settingsModal, visible }`; manages visibility and `defaultTab` state and renders the `SettingsModal` node.                                                                                                                                                                       |
| `settingsViewContext.tsx` | `SettingsViewMode` context (`'modal' \| 'page'`) with `SettingsViewModeProvider` and `useSettingsViewMode()`; lets shared content components branch on modal vs full-page rendering. The modal always provides `'modal'`.                                                                                                                            |
| `model-provider.css`      | Theme-aware (`data-theme` light/dark) hover/focus styles for `.model-provider-action-btn` Arco buttons in the model provider rows.                                                                                                                                                                                                                   |

## Subdirectories

| Directory  | Purpose                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `contents` | Per-tab content panels (model, agent, tools, webui, system, about, extension tab) imported by `index.tsx` (see `contents/AGENTS.md`). |

## For AI Agents

- Renderer-only code: no Node.js APIs; cross-process calls go through the IPC bridge.
- Add a new built-in tab in `index.tsx` in three places: the `builtinItems`/`menuItems` array, the `renderBuiltinContent()` switch, and the `BuiltinSettingTab` union type. Build a content component under `contents/`.
- Extension tabs come from `useExtensionSettingsTabs()`; they are positioned via `tab.position` (`relativeTo` + `before`/`after`), with `LEGACY_ANCHOR_REMAP` translating old anchor ids. Unanchored tabs insert before `system`.
- Extension tabs are lazy-mounted on first visit and kept alive via CSS `display` toggling (`mountedExtTabs`); this set resets when the modal closes to free memory. Built-in tabs render conditionally (unmount on switch).
- Responsiveness keys off `MOBILE_BREAKPOINT` (768px) via a debounced resize listener; do not hardcode widths/heights — reuse the `MODAL_WIDTH`/`MODAL_HEIGHT`/`SIDEBAR_WIDTH` constants.
- Content that must work both here and on the settings route page should read `useSettingsViewMode()` instead of assuming modal context.

## Dependencies

### Internal

- `@/renderer/components/base` (`AionModal`, `AionScrollArea`), `@/renderer/styles/colors`, `@/renderer/utils/platform`, `@/renderer/hooks/system` (`useExtI18n`, `useExtensionSettingsTabs`), `@/renderer/pages/settings/components/SettingsSider` (`LEGACY_ANCHOR_REMAP`), `@/common/adapter/ipcBridge`, `./contents/*`.

### External

- `@arco-design/web-react` (`Tabs`), `@icon-park/react`, `classnames`, `react`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
