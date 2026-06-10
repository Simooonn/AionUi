<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Renderer-side helper utilities for the AionUi desktop UI: a typed in-app event bus, platform/asset-URL detection, preview-error classification, app-restart notifications, and small shared primitives. These are browser-context helpers (no Node.js APIs) used across chat, workspace, and settings views.

## Key Files
| File | Description |
| --- | --- |
| `emitter.ts` | Typed `eventemitter3` bus (`emitter`) with a strict `EventTypes` map (file selection per agent prefix, workspace/chat refresh, `conversation.deleted`, `preview.open`, `sendbox.fill`/`reply`). Exports `addEventListener` (returns unsubscribe) and the `useAddEventListener` React hook. Defines `ReplyQuote` type. |
| `platform.ts` | Environment detection: `isElectronDesktop`, `isMacOS`/`isWindows`/`isLinux`. `resolveBackendAssetUrl`/`resolveExtensionAssetUrl` expand backend-relative paths against the HTTP origin under `file://`. `openExternalUrl` routes through IPC `shell.openExternal` in Electron, else `window.open`. |
| `previewError.ts` | Classifies preview failures into `PreviewErrorKind` (sandbox / not_found / timeout / too_large / unknown) from backend HTTP error codes/status or message regex, and maps each kind to an i18n key via `previewErrorToI18nKey`. |
| `appRestart.ts` | `notifyManualRestartRequired` shows an Arco `Message.info` when an `IAppRestartResult` reports `manualRestartRequired`. |
| `common.ts` | `removeStack` (compose teardown callbacks), local `ToolConfirmationOutcome` enum (copied to avoid pulling Node deps from aioncli-core), re-exports `uuid` from `@/common/utils`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `chat` | Chat/message rendering and conversation helpers (see `chat/AGENTS.md`) |
| `file` | File/folder types and file-handling utilities, incl. `fileTypes` (see `file/AGENTS.md`) |
| `model` | Model-related renderer helpers (see `model/AGENTS.md`) |
| `theme` | Theme utilities (see `theme/AGENTS.md`) |
| `ui` | UI helper utilities (see `ui/AGENTS.md`) |
| `workspace` | Workspace-related helpers (see `workspace/AGENTS.md`) |

## For AI Agents
- Renderer context only: no Node.js APIs. Reach the main process via the IPC bridge (`@/common` `ipcBridge`, dynamically imported as in `platform.ts`/`appRestart.ts`).
- Guard browser globals with `typeof window/navigator !== 'undefined'` (web build also runs these) — follow the existing pattern in `platform.ts`.
- When adding a new cross-component event, extend the `EventTypes` map in `emitter.ts` (tuple = listener args, `void` = no payload); do not emit untyped events.
- Keep `ToolConfirmationOutcome` in `common.ts` in sync manually; it is intentionally a local copy, not an import.
- All user-facing strings resolve to i18n keys (see `previewError.ts` / `appRestart.ts`); never hardcode display text.

## Dependencies
### Internal
`@/common` (ipcBridge, utils), `@/common/adapter/httpBridge`, `@/common/adapter/ipcBridge`, `@/common/types/office/preview`, `@/renderer/utils/file/fileTypes`
### External
`eventemitter3`, `@arco-design/web-react`, `i18next`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
