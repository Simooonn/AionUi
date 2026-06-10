<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# media

## Purpose
Renderer components for displaying and handling file/media content in chat: file attachment menu, file/image previews, upload progress, code diff rendering, and an embedded Electron webview host. These render attachments and rich media inside the conversation UI and sendbox.

## Key Files
| File | Description |
| ---- | ----------- |
| `FileAttachButton.tsx` | Attachment popover (`Trigger`) with menu items for selecting local files, browsing folders, and showing loaded skills/MCP statuses; calls `FileService` and `ipcBridge`. |
| `FilePreview.tsx` | Single attachment chip: detects images by extension, fetches size via `ipcBridge.fs.getFileMetadata`, shows Arco `Image` or a file icon, with optional remove button. |
| `HorizontalFileList.tsx` | Horizontally scrollable wrapper for preview chips; auto shows/hides left/right scroll buttons based on scroll position (rAF-debounced `checkScroll`). |
| `LocalImageView.tsx` | Loads a local image to base64 via `ipcBridge.fs.getImageBase64`, resolving relative paths against a Provider-supplied `root`. Exposes `.Provider` and `.useUpdateLocalImage`. |
| `UploadProgressBar.tsx` | Aggregated + per-file upload progress driven by `useUploadState`/`useActiveUploads`; each row has an abort `x` button (`abortUpload`). Renders nothing when idle. |
| `Diff2Html.tsx` | Renders unified diff strings via `diff2html` `html()`; line/side-by-side toggle, collapsible, preview launcher. Uses `ReactDOM` to mount an operator toolbar into the diff header. |
| `Diff2Html.css` | Theme-aware overrides for diff2html output (paired with `diff2html/bundles/css`). |
| `WebviewHost.tsx` | Shared Electron `<webview>` wrapper extracted from URLViewer: self-managed back/forward history, link/window.open interception, zoom clamp, optional nav bar, partition isolation. |

## For AI Agents
- Renderer-only — NO Node.js APIs. All file/image/fs access goes through `ipcBridge.fs.*` (e.g. `getImageBase64`, `getFileMetadata`).
- `WebviewHost.tsx` touches `Electron.WebviewTag` types and `<webview>` DOM, but stays in the renderer; do not import Node modules.
- `LocalImageView` resolves relative `src` against `root` from its context Provider — wrap consumers in `LocalImageView.Provider`. Absolute/`http`/`data:`/`file:` paths bypass resolution.
- `FilePreview` keys image detection off `IMAGE_EXTS`; `LocalImageView` retry/placeholder logic relies on the `IMAGE_NOT_FOUND_B64_MARKER` magic substring from the main process — keep them in sync.
- `UploadProgressBar` uses a raw `<button>` (exception to the no-raw-HTML rule, already in tree). Prefer Arco for new interactive elements; user-facing strings use `react-i18next` with `defaultValue` fallbacks.

## Dependencies
### Internal
`@/common` (ipcBridge), `@/renderer/services/FileService`, `@/renderer/hooks/file/*` (useUploadState, usePreviewLauncher), `@/renderer/hooks/context/*` (Theme/Conversation), `@/renderer/utils/file/*`, `@renderer/components/chat/CollapsibleContent`.
### External
`@arco-design/web-react`, `@icon-park/react`, `react`, `react-dom`, `react-i18next`, `diff2html`, `classnames`, `swr`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
