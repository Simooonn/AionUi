<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# services

## Purpose
Main-process background services for the desktop app. Holds the electron-updater wrapper that drives the auto-update lifecycle (check / download / quit-and-install) and its on-disk diagnostics log, plus subdirectories for SQLite persistence and main-process i18n.

## Key Files
| File | Description |
| ---- | ----------- |
| `autoUpdaterService.ts` | Singleton `AutoUpdaterService` (extends `EventEmitter`) wrapping `electron-updater`. Selects the platform/arch update channel via `getUpdateChannel()` (custom `latest-arm64` / `latest-win-arm64`), registers autoUpdater event handlers, and broadcasts `AutoUpdateStatus` to a callback. Exposes `checkForUpdates`, `downloadUpdate`, `quitAndInstall`, `checkForUpdatesAndNotify`, prerelease toggle, plus `resetForTest`/`triggerEventForTest` test hooks. Exports the `autoUpdaterService` singleton. |
| `autoUpdateDiagnostics.ts` | Pure-ish helpers that persist update events to `auto-update-diagnostics.json` in `userData` (capped at `MAX_AUTO_UPDATE_EVENTS=20`). Provides `recordAutoUpdateStatus`, `recordAutoUpdateQuitAndInstall`, `readAutoUpdateDiagnostics`, and the testable `appendAutoUpdateDiagnosticEvent`. All file writes swallow errors so diagnostics never break the updater/startup path. |

## Subdirectories
| Directory | Purpose |
| --------- | ------- |
| `database` | SQLite-backed persistence layer for the main process (see `database/AGENTS.md`). |
| `i18n` | Main-process i18n instance/loader, lazily imported by the updater for localized error strings (see `i18n/AGENTS.md`). |

## For AI Agents
- Main process only — no DOM APIs. `autoUpdateDiagnostics.ts` uses `node:fs`/`node:path` directly.
- `autoUpdaterService.ts` is the single source of truth for the update channel; do not set `autoUpdater.allowPrerelease` (it breaks custom channels — prerelease filtering is done via the manual GitHub-API check). See the long comment in `setAllowPrerelease`.
- Update status reaches the renderer through the injected `StatusBroadcastCallback`, not via direct window access — keep the service window-agnostic.
- `i18n` is imported lazily inside `checkForUpdates` (`await import('./i18n')`) to avoid load-order issues; preserve that pattern.
- When changing diagnostics, keep writes non-throwing and respect the 20-event cap and `quit-and-install` `lastQuitAndInstallAt` tracking.

## Dependencies
### Internal
`./i18n` (lazy), within-file imports between the two service files.
### External
`electron` (`app`), `electron-updater` (`autoUpdater`, `UpdateInfo`, `ProgressInfo`), `electron-log`, Node `events`/`fs`/`path`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
