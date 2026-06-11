<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# bridge

## Purpose

Main-process IPC handler registration for app-level concerns: application lifecycle, window controls, dialogs, system settings, notifications, theme relay, auto-update, WebUI lifecycle, and feedback log collection. Each module exposes an `init*Bridge()` that wires `ipcBridge.*.provider(...)` handlers; `initAllBridges()` (index.ts) calls them all during main-process startup.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                 | Barrel + `initAllBridges()` orchestrator; calls every `init*Bridge` and re-exports them. Note: does NOT call `feedbackBridge` (that file self-registers on import).                                                                                                                |
| `applicationBridge.ts`     | Electron-only app handlers: restart, devtools toggle, zoom factor (persisted to `ui.zoomFactor`), renderer log forwarding, CDP config, start-on-boot (macOS/Windows packaged only), GPU override. Holds `mainWindowRef`; exposes `setApplicationMainWindow`, `wasLaunchedAtLogin`. |
| `applicationBridgeCore.ts` | Platform-agnostic subset (safe in WebUI/headless): `updateSystemInfo` (relocates cache/work/log dirs) and `getPath` (home/desktop/downloads via `os.homedir()`).                                                                                                                   |
| `dialogBridge.ts`          | `dialog.showOpen` → native open dialog parented to focused window, returns `filePaths`.                                                                                                                                                                                            |
| `feedbackBridge.ts`        | Self-registering `ipcMain.handle` for `feedback:collect-logs` and `feedback:capture-screenshot`; returns Buffers as number arrays for IPC serialization.                                                                                                                           |
| `notificationBridge.ts`    | `showNotification()` (gated by `system.notificationEnabled` config) + IPC provider; uses `getPlatformServices().notification`.                                                                                                                                                     |
| `restartApplication.ts`    | Pure `restartApplication(app)`: relaunch+exit when packaged, no-op `manualRestartRequired` in dev.                                                                                                                                                                                 |
| `systemSettingsBridge.ts`  | Close-to-tray, keep-awake power blocker (restored on startup), language change (broadcasts before main-process i18n switch), and desktop-pet settings (enabled/size/dnd/confirm). Exposes `onLanguageChanged`.                                                                     |
| `themeBridge.ts`           | Dumb relay: caches resolved `Theme` from renderer `setActive`, re-broadcasts via `changed` and local listeners. Exposes `getCachedTheme`, `onThemeChanged`.                                                                                                                        |
| `updateBridge.ts`          | Largest file — GitHub/CDN release checks, asset allow-listing, semver compare, download with redirect limits, and `autoUpdaterService` integration. Lazy-loads i18n to avoid the initStorage chain.                                                                                |
| `webuiBridge.ts`           | WebUI lifecycle only (start/stop/getStatus); seeds initial admin password by probing aioncore `/api/auth/status` on `globalThis.__backendPort`. Credential ops live on aioncore HTTP, not here.                                                                                    |
| `windowControlsBridge.ts`  | Minimize/maximize/unmaximize/close/isMaximized for focused window; `registerWindowMaximizeListeners(window)` emits `maximizedChanged`.                                                                                                                                             |

## For AI Agents

- Main process only — NO DOM APIs. Most files import `electron` (`app`, `BrowserWindow`, `dialog`, `ipcMain`) directly.
- Register handlers via the typed `ipcBridge.<namespace>.<method>.provider(...)` from `@/common`; only `feedbackBridge` uses raw `ipcMain.handle`. New bridges should add an `init*Bridge()` and wire it into `initAllBridges()` in `index.ts`.
- Several handlers wrap results as `{ success, data, msg }` (application/CDP/GPU/start-on-boot) — match the existing shape per `ipcBridge` type.
- Pet manager modules are dynamically `import()`ed inside handlers (lazy, headless-safe) — keep that pattern rather than top-level imports.
- `applicationBridgeCore` and parts of `systemSettingsBridge`/`webui` are deliberately the WebUI/headless-safe path; some getters (`systemInfo`, `getKeepAwake`) are served by the backend over HTTP, not by these providers — don't duplicate them here.
- Comments are bilingual (Chinese + English) in several files; keep new code comments in English per project convention.

## Dependencies

### Internal

`@/common` (ipcBridge, platform services, theme/update types), `@process/utils` (initStorage/ProcessConfig, zoom, configureChromium, gpuRecovery, tray, webuiConfig), `@process/services` (i18n, autoUpdaterService), `@process/pet`, `../feedback/logs`.

### External

`electron`, `semver`, Node `os`/`path`/`fs`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
