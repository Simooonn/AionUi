<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# services

## Purpose
Renderer-side service singletons and helpers that bridge the chat UI to the backend over HTTP/IPC: file upload, clipboard paste handling, speech-to-text transcription, and PWA service-worker registration. These run in the renderer and reach the backend via `getBaseUrl()` HTTP (works in both Electron and WebUI) or, where noted, the IPC bridge.

## Key Files
| File | Description |
| --- | --- |
| `FileService.ts` | Core upload + file-metadata layer. Exports `uploadFileViaHttp` (XHR multipart POST to `/api/fs/upload`, supports `AbortSignal`, maps HTTP 413 → `FILE_TOO_LARGE`, returns absolute disk path), the `FileService` singleton (`processDroppedFiles` — uploads only files lacking a native Electron `path`), filename helpers (`getCleanFileName`, `cleanAionUITimestamp`, `getFileExtension`), drag-event extractors, and the `UPLOAD_ABORTED_ERROR` sentinel. Extension constants (`imageExts` etc.) and `isSupportedFile`/`isImageFile` are pre-designed but currently accept all types. |
| `PasteService.ts` | `PasteService` singleton managing a global `document` paste listener with per-component handler registration keyed by focus. `handlePaste` uploads clipboard images/files (renaming browser-default `image.png` names via an `ImageCounter` or timestamp, deduping within a batch) and routes plain text to `onTextPaste`. Passes through native paste for editable elements; skips text interception on iOS. |
| `SpeechToTextService.ts` | `transcribeAudioBlob` — enforces a 30MB limit, derives audio extension from MIME, then sends via `ipcBridge.speechToText.transcribe.invoke` in Electron or XHR `POST /api/stt` in WebUI. Returns `SpeechToTextResult`. |
| `registerPwa.ts` | `registerPwa` — registers `./sw.js` only in non-Electron secure/localhost HTTP origins and triggers `registration.update()` on load to push fixed service workers. No-op in Electron. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `i18n` | Renderer i18n setup/runtime helpers (see `i18n/AGENTS.md`). |

## For AI Agents
- Renderer-only: no Node.js APIs. Backend access goes through `uploadFileViaHttp`/XHR using `getBaseUrl()` (`@/common/adapter/httpBridge`), or `ipcBridge` for STT — never construct absolute `http://127.0.0.1` URLs directly.
- Upload cancellation is signal-based: each upload owns an `AbortController`, and `trackUpload` (from `@/renderer/hooks/file/useUploadState`) wires `onAbort` so user cancel and conversation-switch bulk-abort share one path. Treat `UPLOAD_ABORTED_ERROR` as silent drop; re-throw `FILE_TOO_LARGE`.
- Services here are exported as module singletons (`FileService`, `PasteService`). `PasteService.init()`/`destroy()` attach/detach the global listener — call them in matching lifecycle hooks.
- Backend multipart field names are a hard contract (snake_case `file`, `file_name`, `conversation_id`); do not rename.
- Many `FileService` type-check exports (`isSupportedFile`, `filterSupportedFiles`, `isImageFile`) are placeholders that always return `true`/all files — do not assume they filter.

## Dependencies
### Internal
`@/common` (ipcBridge), `@/common/adapter/httpBridge`, `@/common/config/constants`, `@/common/types/provider/speech`, `@/renderer/hooks/file/useUploadState`, `@/renderer/utils/platform`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
