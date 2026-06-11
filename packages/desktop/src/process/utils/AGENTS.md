<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose

Main-process boot-time helpers for the Electron desktop app: storage/config bootstrapping, one-shot data migrations, window/tray/menu lifecycle, GPU crash recovery, deep-link handling, and WebUI host management. These modules run during app startup and own the durable on-disk state under `userData`.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | Barrel re-exporting path/dir helpers from `utils.ts` (`getTempPath`, `getDataPath`, `getConfigPath`, `ensureDirectory`, `resolveCliSafePath`, recursive copy/verify helpers).                                                                                    |
| `utils.ts`                | Filesystem + path utilities; resolves Electron-or-fallback temp/home/userData dirs via `getPlatformServices()`, creates CLI-safe symlinks on macOS (paths without spaces for CLI tools like Qwen).                                                               |
| `initStorage.ts`          | Sets dev app name / userData isolation, migrates legacy temp→userData data, and exports the persisted stores `ProcessConfig`/`ProcessChat`/`ProcessChatMessage`/`ProcessEnv` plus `getSystemDir`, `getAssistantsDir`, `getSkillsDir`, `getBuiltinMcpScriptPath`. |
| `runBackendMigrations.ts` | Orchestrates one-time backend migrations (config storage, providers, MCP config, image-gen MCP env, assistants); cleans up legacy client-preference keys.                                                                                                        |
| `migrateAssistants.ts`    | Migrates legacy `<userData>/config/assistants/*.<locale>.md` rule files into the backend; promotes legacy `'gemini'` default agent type to current `'aionrs'`.                                                                                                   |
| `webuiConfig.ts`          | Reads/writes WebUI desktop preferences (`webui.desktop.*`) from backend `/api/settings/client`; starts the `@aionui/web-host` server. Holds legacy `webui.config.json`.                                                                                          |
| `ensureAdminUser.ts`      | Boot migration: moves legacy admin password hash from `webui.config.json` into aioncore SQLite `users` table; idempotent, failure-swallowing.                                                                                                                    |
| `resetPasswordCLI.ts`     | `--resetpass` CLI flow; reuses the already-started backend (`globalThis.__backendPort`) to reset `system_default_user`.                                                                                                                                          |
| `gpuRecovery.ts`          | Persists GPU crash counts in `gpu.config.json`; disables hardware acceleration after 3 consecutive crashes, with `force-on`/`force-off` user overrides.                                                                                                          |
| `configureChromium.ts`    | Appends Chromium command-line switches for WebUI/`--resetpass` modes (headless Ozone on Linux, sandbox handling for root).                                                                                                                                       |
| `configureConsoleLog.ts`  | Redirects main-process console output to `electron-log` daily files; parses/levels `[aioncore]` backend tracing lines.                                                                                                                                           |
| `tray.ts`                 | System tray icon, menu, close-to-tray behavior, quitting state; holds main-window ref and active-conversation count.                                                                                                                                             |
| `zoom.ts`                 | Global UI zoom factor (0.8–1.3) with clamp, persistence via `trackPersistedWrite`, and Cmd/Ctrl +/-/0 handling.                                                                                                                                                  |
| `windowBounds.ts`         | Restores/persists main-window size+position (debounced 300ms); mirrors `zoom.ts` load-then-attach pattern.                                                                                                                                                       |
| `mainWindowLifecycle.ts`  | Binds the main-window ref into tray/deep-link/application modules; show-or-create / show-and-focus helpers.                                                                                                                                                      |
| `deepLink.ts`             | Parses `aionui://` URLs (two formats incl. base64 `data`), queues pending links, emits to renderer via `ipcBridge.deepLink`.                                                                                                                                     |
| `persistOnQuit.ts`        | Tracks fire-and-forget writes so `before-quit` flushes them before teardown (prevents lost settings on ⌘Q). Exports test-reset helper.                                                                                                                           |
| `appMenu.ts`              | Builds the application menu template (mac-aware), wires Help → Check for Updates to `ipcBridge.update.open`.                                                                                                                                                     |
| `closeToTraySetting.ts`   | Reads/writes the `system.closeToTray` setting across local `ProcessConfig` and backend client settings (with legacy key fallback).                                                                                                                               |
| `analyticsId.ts`          | Returns a persistent anonymous UUID stored in `analytics.json` (mode 0600); best-effort, never throws.                                                                                                                                                           |
| `initBridge.ts`           | Configures `logger` print mode and calls `initAllBridges()` to register IPC bridges.                                                                                                                                                                             |

## For AI Agents

- Main process only — NO DOM APIs. These modules freely use `electron`, `node:fs`, `node:crypto`, `node:child_process`.
- Use `@/common/electronSafe` re-exports (see `tray.ts`) rather than importing `electron` directly where lazy/safe access matters.
- Persisted settings (zoom, window bounds) must be wrapped in `trackPersistedWrite` from `persistOnQuit.ts` so they survive quit; do not write directly without it.
- Boot migrations (`ensureAdminUser`, `runBackendMigrations`, `migrateAssistants`) are idempotent and swallow errors so they never block startup — preserve that contract.
- Many singletons hold a `mainWindowRef` populated by `mainWindowLifecycle.bindMainWindowReferences`; emit nothing to the renderer before the window exists (deep-link queues instead).
- `initStorage.ts` must set the dev app name before any `app.getPath()` call — order-sensitive.

## Dependencies

### Internal

`@/common` (ipcBridge, electronSafe, platform, config storage/migration, httpBridge), `@process/services` (i18n, database migrations), `../bridge`, `../resources/builtinMcp`.

### External

`electron`, `electron-log`, `@office-ai/platform`, `@aionui/web-host`, `@icon-park`-adjacent none (no UI), Node builtins (`fs`, `crypto`, `path`, `os`, `child_process`, `http`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
