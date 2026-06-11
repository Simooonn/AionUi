<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose

Source root for the AionUi Electron desktop app. Holds the main-process entry point (`index.ts`) and the four process layers (common, preload, process, renderer). `index.ts` is the Electron bootstrap; `sentry.ts` wires crash/error telemetry for the main process.

## Key Files

| File         | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`   | Main-process entry. Configures Chromium and console before any `userData` access, acquires the single-instance lock, handles `aionui://` deep links / `second-instance`, starts the backend (`startBackendOrExit`) and web host, creates/restores the BrowserWindow (tray, zoom, saved bounds), and registers `open-url` / `window-all-closed` / `activate` / `will-quit` / `quit` lifecycle handlers. |
| `sentry.ts`  | Main-process Sentry init (`initSentry`, `setSentryDeviceId`), backend startup-failure capture (`captureBackendStartupFailure`), and gzip log-packing helpers (`selectRecentLogFiles`, `packAndCap`, `scheduleStartupLogReport`). Drops GPU-crash and backend-startup noise via `beforeSend` pattern filters.                                                                                           |
| `types.d.ts` | Ambient module declarations for untyped deps (`@xterm/headless` headless build, `diff`, and a typed `cookie.parse`).                                                                                                                                                                                                                                                                                   |

## Subdirectories

| Directory  | Purpose                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `common`   | Cross-process shared code: IPC bridge definitions, adapters, types, config (see `common/AGENTS.md`).                 |
| `preload`  | Context-bridge layer exposing main-process IPC to the renderer (see `preload/AGENTS.md`).                            |
| `process`  | Main-process logic: startup, services, bridges, window/tray/deep-link utils — NO DOM APIs (see `process/AGENTS.md`). |
| `renderer` | React UI for the renderer process — NO Node.js APIs (see `renderer/AGENTS.md`).                                      |

## For AI Agents

- `index.ts` import order is load-bearing: `./process/utils/configureChromium` and `initSentry()` must run before any module that calls `app.getPath('userData')` (Electron caches the path on first call). Do not reorder the top imports.
- `index.ts` and `sentry.ts` are main-process only — Node APIs (`fs`, `path`, `zlib`, `electron`) are fine here, DOM APIs are not.
- `sentry.ts` filters events via drop-pattern arrays (`GPU_CRASH_DROP_PATTERNS`, `BACKEND_STARTUP_SECONDARY_DROP_PATTERNS`); add new noise suppression there rather than at call sites.
- Single-instance behavior is bypassed when `AIONUI_E2E_TEST=1` or `AIONUI_MULTI_INSTANCE=1`; preserve those escape hatches when editing the lock logic.
- Some comments in `sentry.ts` are in Chinese (per repo convention default English, but existing notes reference internal `ELECTRON-9x` tickets — keep them).

## Dependencies

### Internal

`./process/*` (startup, services, bridges, utils), `./common` (ipcBridge, adapters, types), `@process/*` aliases, `@aionui/web-host`.

### External

`electron`, `@sentry/electron/main`, `fix-path`, `electron-squirrel-startup`, Node `fs`/`path`/`zlib`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
