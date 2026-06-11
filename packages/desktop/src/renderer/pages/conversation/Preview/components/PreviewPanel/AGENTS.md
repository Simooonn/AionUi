<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# PreviewPanel

## Purpose

The slide-out preview panel shown alongside a conversation. `PreviewPanel.tsx` is the container that reads `usePreviewContext()`, manages view mode / split-screen / inspect state, and dispatches each tab to a viewer or editor (`../viewers`, `../editors`, `../renderers`). The sibling files break out the panel's UI pieces: the tab bar, toolbar, right-click menu, confirm modals, and history dropdown.

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreviewPanel.tsx`           | Main container component. Wires `usePreviewContext` (tabs, save, content), layout context, resizable split, preview hooks (`usePreviewHistory`, `usePreviewKeyboardShortcuts`, `useScrollSync`, `useTabOverflow`, `useThemeDetection`), and routes the active tab to the correct viewer/editor. |
| `PreviewTabs.tsx`            | Scrollable tab bar with dirty-dot indicator, close buttons, left/right overflow fade gradients, and a collapse-panel button. Exports `PreviewTab` type.                                                                                                                                         |
| `PreviewToolbar.tsx`         | Toolbar with source/preview toggle, split-screen, download, "open in system", and snapshot/history entry (gated by `SHOW_SNAPSHOT_HISTORY = false`). Uses `shouldShowDownload`.                                                                                                                 |
| `PreviewContextMenu.tsx`     | Tab right-click menu (close left/right/others/all). Closes on outside `mousedown`. Exports `ContextMenuState`.                                                                                                                                                                                  |
| `PreviewConfirmModals.tsx`   | "Close tab with unsaved changes" Arco `Modal` offering save-and-close / close-without-save. Exports `CloseTabConfirmState`.                                                                                                                                                                     |
| `PreviewHistoryDropdown.tsx` | Dropdown listing `PreviewSnapshotInfo[]` history versions with loading/error/empty states; calls `onSnapshotSelect`.                                                                                                                                                                            |
| `previewToolbarUtils.ts`     | `shouldShowDownload(contentType, hasFilePath)` — hides download for code/markdown already backed by a file on disk.                                                                                                                                                                             |
| `index.ts`                   | Barrel re-exporting the sub-components and their state/type exports.                                                                                                                                                                                                                            |
| `preview.css`                | Panel slide-in keyframe animation; honors `prefers-reduced-motion`.                                                                                                                                                                                                                             |

## For AI Agents

- Renderer-only code: NO Node.js APIs. File system / shell actions go through `ipcBridge` (`@/common`) and renderer utils like `downloadFileFromPath` / `downloadTextContent`.
- All user-facing text uses `useTranslation()` under the `preview.*` (and `common.*`) i18n namespace — never hardcode strings.
- Theme: components take `currentTheme: 'light' | 'dark'` and switch inline `backgroundColor` (e.g. `#1d1d1f` vs `#ffffff`); icon colors come from `@/renderer/styles/colors` `iconColors`, borders from `var(--border-base)`. Prefer the semantic UnoCSS tokens already used here (`bg-bg-2`, `text-t-primary`, etc.).
- Note `PreviewConfirmModals.tsx` uses raw `<button>` elements in the modal footer — this predates the no-raw-HTML convention; prefer Arco components for new interactive elements.
- The history/snapshot toolbar entry is intentionally hidden behind `SHOW_SNAPSHOT_HISTORY`; the underlying logic and `PreviewHistoryDropdown` are kept wired.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/types/office/preview`, `@/renderer/styles/colors`, `@/renderer/utils/file/download`, `@/renderer/hooks/*` (LayoutContext, useResizableSplit), `../../context` (PreviewContext, PreviewToolbarExtrasContext), `../../hooks`, `../../constants`, and the `../viewers` / `../editors` / `../renderers` previewers.

### External

`react`, `react-i18next`, `@arco-design/web-react` (Modal, Dropdown, IconShrink), `@icon-park/react` (Close).

<!-- MANUAL: notes below this line are preserved on regeneration -->
