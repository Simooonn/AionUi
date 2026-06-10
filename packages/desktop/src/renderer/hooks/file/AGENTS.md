<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# file

## Purpose
Renderer-side React hooks for file-centric workflows in the chat UI: uploads (drag/paste/dialog), in-flight upload tracking and aborting, file/diff/Office preview launching, workspace and directory selection, and conversation transcript export.

## Key Files
| File | Description |
| --- | --- |
| `useUploadState.ts` | Module-level upload store (no Context) exposed via `useSyncExternalStore`. Exports `trackUpload`, `abortUpload`, `abortUploads`, `useUploadState`, `useActiveUploads`, and the `UploadSource` (`'sendbox' \| 'workspace'`) type. Tracks per-file progress, weighted overall percent, and per-conversation binding. |
| `useAbortUploadsOnConversationChange.ts` | Effect hook that calls `abortUploads` to cancel uploads bound to a previous `conversationId` on switch, and everything in `source` on unmount. |
| `useDragUpload.ts` | Drag-and-drop file handling with a drag counter to avoid flicker; filters via `isSupportedFile`, routes through `FileService.processDroppedFiles`. Returns `isFileDragging` + `dragHandlers`. |
| `usePasteService.ts` | Wires a SendBox to the singleton `PasteService` (register/unregister handler, focus tracking, per-component pasted-image counter). |
| `useOpenFileSelector.ts` | Opens native file dialog (`ipcBridge.dialog.showOpen`) for the `+` button and `/open` slash command; in WebUI falls through to `DirectorySelectionModal`. |
| `useDirectorySelection.tsx` | Listens for `SHOW_OPEN_REQUEST_EVENT` over the `@office-ai/platform` bridge and renders `DirectorySelectionModal`; replies via the global `window.__emitBridgeCallback`. WebUI file/dir picker. |
| `useWorkspaceSelector.ts` | Picks a new workspace dir, persists to `conversation.extra.workspace` via IPC, refreshes SWR cache, emits `{prefix}.workspace.refresh` + `chat.history.refresh`. |
| `usePreviewLauncher.ts` | Core preview opener. Resolves workspace+relative path, does optimistic fallback render, reads file content (image base64 / binary-by-path / text with 5s `Promise.race` timeout), truncates large text. Returns `launchPreview`, `loading`, `errorKind`. |
| `useDiffPreviewHandlers.ts` | Thin wrapper over `usePreviewLauncher` producing `handleFileClick`/`handleDiffClick` for `FileChangesPanel`. |
| `useAutoPreviewOfficeFiles.ts` | Watches the workspace via `ipcBridge.workspaceOfficeWatch`; auto-opens a preview tab for newly added `.pptx/.docx/.xlsx`. Normalizes `/private/var`/`/private/tmp` paths and debounces opens by 1s. |
| `useConversationExport.tsx` | State machine (`closed`/`menu`/`filename`) for the export flow: builds transcript, copies to clipboard or saves to workspace/desktop file via IPC, with keyboard navigation. |

## For AI Agents
- Renderer process — no Node.js APIs. All filesystem/dialog/watch work goes through `ipcBridge` (`@/common`) or the `@office-ai/platform` bridge; never touch `fs` directly.
- `useUploadState.ts` is a standalone module store: `trackUpload`/`abortUploads` are plain functions callable outside React. Keep snapshot references stable (the file caches `activeListGlobal`/`activeListBySource`) so `useSyncExternalStore` doesn't loop.
- Path handling is subtle: `usePreviewLauncher` joins `workspace + relativePath`; `useAutoPreviewOfficeFiles` strips the macOS `/private` prefix before comparing watch events. Reuse these helpers rather than reimplementing.
- User-facing strings use i18n (`useTranslation` / a passed-in `t`); Arco `Message`/`Button` for UI. Some files still carry Chinese inline comments — match the existing comment language when editing them.
- Office/binary preview types (`pdf/ppt/word/excel`) render from `file_path` only — do not read their bytes into memory.

## Dependencies
### Internal
`@/common` (ipcBridge, `joinPath`, chat types), `@/renderer/services` (`FileService`, `PasteService`), `@/renderer/hooks/context/ConversationContext`, `@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled`, `@/renderer/pages/conversation/Preview`, `@/renderer/utils` (`file/fileType`, `file/diffUtils`, `chat/conversationExport`, `previewError`, `ui/clipboard`, `emitter`, `common`), `@/renderer/components` (`FileChangesPanel`, `DirectorySelectionModal`, `SlashCommandMenu`).
### External
`react`, `react-i18next`, `swr`, `@arco-design/web-react`, `@office-ai/platform`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
