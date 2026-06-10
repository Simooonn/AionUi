<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Pure renderer-side helpers backing the Workspace file-tree panel: VS Code-style icon resolution, in-app preview capability checks, and `IDirOrFile` tree manipulation (find/merge/rename/flatten) used when rendering and mutating the Arco `Tree` of workspace files.

## Key Files
| File | Description |
| --- | --- |
| `treeHelpers.ts` | Core tree algorithms over `IDirOrFile[]`: `extractNodeData`/`extractNodeKey` (read `dataRef`/`_data`/`key` off Arco `NodeInstance`), `findNodeByKey`, `mergeLoadedChildren` (re-attach lazy-loaded children after a root refresh, matched by `relativePath`), `updateTreeForRename`/`updateChildrenPaths`/`replacePathInList` (path rewrites after rename), `collectFilePaths`, `flattenSingleRoot`, `getFirstLevelKeys`, `getTargetFolderPath`, `getPathSeparator`, and `computeContextMenuPosition` (clip menu to `window` viewport). |
| `fileIcon.ts` | Maps a file node to a `vscode-icons` icon name via the `EXTENSION_TO_ICON` table; exports `ICON_PREFIX`, `getFileIconName` (falls back to `default-file`), `getFolderIconName(expanded)`, `getNodeIconExtension`. Extensions must reference an icon bundled in `vscodeIconsData.json`. |
| `filePreview.ts` | `PREVIEW_SUPPORTED_EXTENSIONS` set plus `isPreviewSupportedExt(filename)` — decides whether a file opens in the in-app preview pane. |
| `vscodeIconsData.json` | Iconify-format icon set (`prefix: "vscode-icons"`, `icons` map of name → inline SVG `body`); the only icons `fileIcon.ts` may name. |

## For AI Agents
- Renderer-only (NO Node.js APIs). `computeContextMenuPosition` guards `window` access with `typeof window !== 'undefined'`; keep that guard.
- When adding a new extension to `fileIcon.ts`, confirm the target icon name exists in `vscodeIconsData.json`, or the icon will render blank.
- `EXTENSION_TO_ICON` (icons) and `PREVIEW_SUPPORTED_EXTENSIONS` (preview) are separate lists with different purposes — update each deliberately, not in lockstep.
- Tree mutators return new node objects (spread copies) but reuse old `children` references in `mergeLoadedChildren` — treat results as shallow-immutable.
- Comments mix Chinese and English; match the surrounding style of the file you edit. JSDoc stays English.

## Dependencies
### Internal
- `@/common/adapter/ipcBridge` (`IDirOrFile` type)
- `@/renderer/pages/conversation/Preview/fileUtils` (`getFileExtension`)
### External
- `@arco-design/web-react` (`NodeInstance` type from the `Tree` interface)

<!-- MANUAL: notes below this line are preserved on regeneration -->
