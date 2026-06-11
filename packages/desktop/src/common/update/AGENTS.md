<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# update

## Purpose

Shared TypeScript type definitions for AionUi's app-update flow. These types describe GitHub release metadata, manual download requests/progress, and electron-updater auto-update status — consumed by both the main process (update logic) and renderer (update UI) over IPC.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateTypes.ts` | Interfaces/types for the update system: `GitHubReleaseAsset` (with CDN `url` + GitHub `fallbackUrl`), `UpdateReleaseInfo`, `UpdateCheckRequest`/`UpdateCheckResult`, `UpdateDownloadRequest`/`UpdateDownloadResult`, `UpdateDownloadProgressEvent` (+ `UpdateDownloadStatus`), and electron-updater `AutoUpdateStatus`/`AutoUpdateProgress` (+ `AutoUpdateStatusType`). |

## Subdirectories

| Directory | Purpose                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `models`  | Model/data definitions related to the update feature (see `models/AGENTS.md`). |

## For AI Agents

- This directory holds **pure type declarations only** — no runtime logic, no DOM or Node.js APIs. Safe to import from either process.
- Naming follows existing conventions: GitHub asset URLs are split into a primary CDN `url` and a `fallbackUrl` (used when the CDN is unreachable); request types default `repo` to `iOfficeAI/AionUi`.
- Two parallel update mechanisms coexist here: manual download (`UpdateDownload*`) and electron-updater auto-update (`AutoUpdate*`) — keep their status string unions distinct and do not merge them.
- Snake_case fields (`file_name`, `file_path`) are intentional and match the rest of the IPC payload shapes; preserve them when adding fields.

## Dependencies

### External

None — file contains only TypeScript interfaces/types with no imports.

<!-- MANUAL: notes below this line are preserved on regeneration -->
