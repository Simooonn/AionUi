<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# preload

## Purpose

Electron preload scripts that run in the isolated bridge context between Main and Renderer. Each file uses `contextBridge.exposeInMainWorld` to publish a typed `window.*` API backed by `ipcRenderer`, giving the React renderer a safe, sandbox-compatible channel to the Main process. There is one preload per BrowserWindow type: the primary app window plus three desktop-pet windows.

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`              | Preload for the main app window. Exposes `window.electronAPI` (generic `emit`/`on` over `ADAPTER_BRIDGE_EVENT_KEY`, `getPathForFile` via `webUtils`, feedback log/screenshot IPC). Synchronously reads backend port, initial language, and backend-startup-failure state via `sendSync` and exposes them as `__backendPort` / `__initialLanguage` / `__backendStartupFailed` / `__backendStartupFailure`. Imports `@sentry/electron/preload` and re-dispatches `tray:*` IPC events as DOM `CustomEvent`s. |
| `petConfirmPreload.ts` | Exposes `window.petConfirmAPI` for the pet confirmation window: `onConfirmationAdd/Update/Remove`, `onThemeChange`, `respond`, and `dragStart/dragEnd`.                                                                                                                                                                                                                                                                                                                                                   |
| `petHitPreload.ts`     | Exposes `window.petHitAPI` for the pet hit-area window: `dragStart/dragEnd`, `click`, `contextMenu`, `setIgnoreMouseEvents`, and `onHitReset`.                                                                                                                                                                                                                                                                                                                                                            |
| `petPreload.ts`        | Exposes `window.petAPI` for the pet animation window: `onStateChange`, `onEyeMove`, `onResize` event subscriptions.                                                                                                                                                                                                                                                                                                                                                                                       |

## For AI Agents

- This is the IPC bridge layer — preload runs in a privileged isolated context. Use ONLY `electron` APIs (`contextBridge`, `ipcRenderer`, `webUtils`); do not import renderer DOM components or Main-process modules here.
- Always expose APIs through `contextBridge.exposeInMainWorld` — under `contextIsolation` direct `window.x = ...` assignment is invisible to the renderer (see `main.ts` comments around the `__backendPort` block).
- The generic channel name `ADAPTER_BRIDGE_EVENT_KEY` is the single bus for the main app; pet windows use literal `pet:*` channel strings. Keep both ends (Main IPC handlers in `../process/` and renderer consumers) in sync when changing channels.
- `sendSync` is intentional for startup values that must be available before the renderer's first paint — prefer it only for these synchronous bootstrap reads.
- `main.ts` is bundled (not externalized) so the sandboxed preload can resolve `@sentry/electron/preload`; keep new imports bundler-friendly.
- Window-side API shapes should stay in sync with the global `window.*` type declarations the renderer relies on.

## Dependencies

### Internal

- `../common/adapter/constant` (`ADAPTER_BRIDGE_EVENT_KEY`)
- `@/common/theme/types` (`Theme`)

### External

- `electron` (`contextBridge`, `ipcRenderer`, `webUtils`)
- `@sentry/electron/preload`

<!-- MANUAL: notes below this line are preserved on regeneration -->
