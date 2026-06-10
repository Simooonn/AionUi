<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# file

## Purpose
Renderer-side helpers for working with files in the chat UI: classifying file types for the Office/preview panel, parsing diffs, downloading files, building message attachments, and filtering/merging workspace `@`-mention selections. All run in the renderer process (no Node.js fs) and reach disk through the IPC bridge.

## Key Files
| File | Description |
| --- | --- |
| `fileType.ts` | `getFileTypeInfo(file_name)` maps an extension to a `PreviewContentType` (markdown/html/diff/pdf/ppt/word/excel/image/code) plus `editable` + Monaco `language`; unknown extensions fall back to editable `code`. |
| `fileTypes.ts` | `FileOrFolderItem` type (`path`, `name`, `isFile`, optional `relativePath`) shared across this dir. |
| `diffUtils.ts` | `parseFilePathFromDiff`, `extractContentFromDiff`, and `parseDiff` (returns `FileChangeInfo` with insertions/deletions); handles git, SVN `Index:`, and `+++ b/`/`--- a/` headers. |
| `download.ts` | `downloadFileFromPath` (reads bytes via `ipcBridge.fs.getImageBase64`, decodes, triggers anchor download) and `downloadTextContent` for in-memory text. |
| `base64.ts` | `base64ToBlob` (atob decode to bypass CSP `connect-src`) and `BINARY_MIME_MAP` (extension → MIME for office/archive downloads). |
| `messageFiles.ts` | `collectSelectedFiles` (dedupe uploads + `@`-paths) and `buildDisplayMessage` (appends sanitized workspace-relative paths under `AIONUI_FILES_MARKER`). |
| `fileSelection.ts` | `mergeFileSelectionItems` — dedupes string/`FileOrFolderItem` selections by path, upgrading strings to richer items. |
| `workspaceMentions.ts` | `filterWorkspaceMentionItems` — scores/sorts workspace items against an `@`-mention query (exact > stem > prefix > includes), default limit 8. |
| `workspaceFs.ts` | `removeWorkspaceEntry` / `renameWorkspaceEntry` thin wrappers over `ipcBridge.fs`. |

## For AI Agents
- Renderer-only: never import Node `fs`/`path` here. Disk access goes through `ipcBridge.fs.*` (see `download.ts`, `workspaceFs.ts`).
- `download.ts`/`base64.ts` deliberately use `atob` + `URL.createObjectURL` instead of `fetch('data:...')` because WebUI mode's CSP blocks data-URL fetches — keep this pattern.
- Field naming is snake_case for file-related params (`file_name`, `file_path`, `new_name`) to mirror IPC payloads; match the surrounding style.
- `buildDisplayMessage` strips `AIONUI_TIMESTAMP_REGEX` and only rewrites paths inside the workspace; external absolute paths are left intact so preview lookups still resolve.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/config/constants` (`AIONUI_FILES_MARKER`, `AIONUI_TIMESTAMP_REGEX`), `@/common/types/office/preview` (`PreviewContentType`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
