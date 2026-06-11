<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# platform

## Purpose

Runtime abstraction layer that decouples shared code from `electron`-specific APIs. Defines `IPlatformServices` (paths, worker fork, power/sleep, notifications, network fetch) and provides two implementations — Electron and plain Node — selected at process startup so the same shared code runs in the Electron main process and in headless/utility-process server contexts.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IPlatformServices.ts`        | Interface definitions: `IPlatformPaths`, `IWorkerProcess(Factory)`, `IPowerManager`, `INotificationService`, `INetworkService`, and the aggregate `IPlatformServices`. Source of truth for the contract; doc comments describe non-Electron degradation.                                                                                 |
| `index.ts`                    | Singleton registry: `registerPlatformServices()` / `getPlatformServices()`, plus `getDevAppName()` for dev env isolation. Lazily auto-registers an inline Electron impl (or `NodePlatformServices` in utility processes) when called before explicit registration, working around Rollup chunk ordering. Re-exports the interface types. |
| `ElectronPlatformServices.ts` | The ONLY file here allowed to import `electron`. Implements services via `app`/`net`/`Notification`/`powerSaveBlocker`/`utilityProcess`; forks workers propagating `DATA_DIR` into child env.                                                                                                                                            |
| `NodePlatformServices.ts`     | Pure-Node implementation using `child_process.fork` (serialization `'advanced'`), `os`/`fs`, global `fetch`; reads name/version from `package.json`. Power/notification are no-ops; reads `DATA_DIR`/`LOGS_DIR`/`IS_PACKAGED` env vars.                                                                                                  |
| `register-electron.ts`        | Side-effect module: must be the FIRST import in `src/process/index.ts`; calls `registerPlatformServices(new ElectronPlatformServices())`.                                                                                                                                                                                                |

## For AI Agents

- This is shared (`common`) code consumed by the main/server process — do NOT add DOM APIs.
- Keep the `electron` import confined to `ElectronPlatformServices.ts` (and the guarded `require('electron')` in `index.ts`); never import `electron` into `IPlatformServices.ts` or `NodePlatformServices.ts`.
- When adding a method to any interface in `IPlatformServices.ts`, you must implement it in BOTH `ElectronPlatformServices.ts` and `NodePlatformServices.ts` AND the inline `IPlatformPaths` object in `index.ts` (typed annotation there forces a compile error if omitted).
- Non-Electron behavior is intentional degradation: power returns `null`, notifications are no-ops, system paths return `null`. Callers must null-guard (e.g. `power.allowSleep` accepts `null`).
- The inline fallback in `index.ts` branches on `process.type` (`'browser'` vs utility) — preserve this when editing startup logic.

## Dependencies

### External

- `electron` (`app`, `net`, `Notification`, `powerSaveBlocker`, `utilityProcess`) — Electron impl only
- Node built-ins: `child_process`, `fs`, `os`, `path`

<!-- MANUAL: notes below this line are preserved on regeneration -->
