<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Presentational React components for the conversation Workspace panel: the file tree toolbar/tab bar, the file-change (git diff) list, file-type icons, and the rename/delete/paste modals plus the right-click context menu. These are stateless view components — all state and handlers are passed down as props from the parent Workspace container.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileChangeList.tsx`       | Git-style staged/unstaged change list. Renders per-file diff via `Diff2Html`, computes add/delete stats from patch text (`createDiffStats`, `createTwoFilesPatch` from `diff`), supports stage/unstage/discard/reset and open-diff actions. Largest component here. |
| `WorkspaceToolbar.tsx`     | Top toolbar: collapsible workspace name, search input toggle, refresh button, and (non-Electron only) an upload dropdown menu. Embeds `UploadProgressBar`. Gates host-file upload behind `isElectronDesktop()`.                                                     |
| `WorkspaceTabBar.tsx`      | Arco `Tabs` switching between `files` and `changes` panes; shows change count badge (capped at `99+`) and a read-only current-branch dropdown.                                                                                                                      |
| `WorkspaceContextMenu.tsx` | Fixed-position right-click menu (add-to-chat, open, reveal, preview, download, delete, rename). Disables delete/rename on the root node; gates preview via `isPreviewSupportedExt`. Uses raw `<button>` elements styled with shared `MENU_BUTTON_BASE` classes.     |
| `WorkspaceDialogs.tsx`     | Combined rename (`Input`) and delete-confirmation Arco `Modal`s, driven by `RenameModalState`/`DeleteModalState` props.                                                                                                                                             |
| `PasteConfirmModal.tsx`    | Modal confirming a file paste operation; lists files to paste and shows the target folder path.                                                                                                                                                                     |
| `FileTypeIcon.tsx`         | File-tree leading icon using the bundled `vscode-icons` Iconify subset (registered once via `addCollection`). Resolves names through `getFileIconName`/`getFolderIconName` from `../utils/fileIcon`.                                                                |

## For AI Agents

- Renderer-only code: no Node.js APIs. IPC goes through `ipcBridge` from `@/common` (used in `FileChangeList.tsx`).
- These components receive `t: TFunction` as a prop rather than calling `useTranslation` themselves; keep that pattern and use `conversation.workspace.*` i18n keys (no hardcoded strings).
- State types (`WorkspaceTab`, `RenameModalState`, `DeleteModalState`, `PasteConfirmState`, `TargetFolderPath`) live in `../types` — import from there, don't redeclare.
- `FileTypeIcon.tsx` and `WorkspaceContextMenu.tsx` are deliberate, documented exceptions to project conventions: the former uses `@iconify/react` instead of `@icon-park/react` (to mirror VSCode explorer icons), and the latter uses raw `<button>` for the menu items. Preserve those comments if you touch them.
- Colors use `iconColors` from `@/renderer/styles/colors` and semantic CSS vars (`var(--color-text-3)`, `rgb(var(--primary-6))`); do not hardcode hex values.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/adapter/ipcBridge` (`IDirOrFile`), `@/common/types/platform/fileSnapshot`
- `@/renderer/components/media/Diff2Html`, `@/renderer/components/media/UploadProgressBar`, `@/renderer/services/FileService`, `@/renderer/styles/colors`, `@/renderer/utils/platform`
- `../types`, `../utils/fileIcon`, `../utils/filePreview`, `../utils/vscodeIconsData.json`

### External

- `@arco-design/web-react` (Modal, Tabs, Dropdown, Menu, Input, Button, etc.), `@icon-park/react`, `@iconify/react`, `diff`, `i18next` (`TFunction`), `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
