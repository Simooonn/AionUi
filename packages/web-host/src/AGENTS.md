<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose

Source of `@aionui/web-host`, the Electron-free Node host that powers the WebUI mode: it spawns the aioncore backend subprocess, serves the built renderer SPA, and reverse-proxies API/WS/auth traffic to the backend. This package has no Electron or DOM dependency — host metadata (version, paths, binary resolver) is injected by callers (Electron main process or the `bun run webui` CLI).

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                    | Barrel + `startWebHost(opts)` orchestrator that wires `startBackend` (own backend) or a fake handle (existing backend) into `startStaticServer`, returning a combined `WebHostHandle`; cleans up the backend if the static server fails.                                                                                                                |
| `types.ts`                    | Interface contract: `AppMetadata`, `BackendBinaryResolver`, `BackendSystemDirs`, `WebHostOptions`, `WebHostHandle`. The backend union is `{ kind: 'ownBackend' \| 'useExistingBackend' }`.                                                                                                                                                              |
| `backend-launcher.ts`         | aioncore subprocess lifecycle manager (migrated from `desktop/src/process/backend/lifecycleManager.ts`, Electron removed). Exports `BackendLifecycleManager`, `startBackend`/`stopBackend`, `findAvailablePort`, `buildSpawnArgs`, `buildSpawnEnv`, and `BackendStartupCancelledError`. Handles /health polling, SIGTERM→SIGKILL, crash-restart window. |
| `static-server.ts`            | Native `http` + `serve-handler` SPA server (no Express). Serves `staticDir`; reverse-proxies `/api/*`, `/ws`, `/login`, `/logout` to aioncore on `127.0.0.1:backendPort`. Exports `startStaticServer`/`stopStaticServer`; binds loopback unless `allowRemote`. Default port 25808.                                                                      |
| `agent-process-registry.ts`   | Reads `runtime/agent-process-registry.json` under `dataDir` and terminates orphaned agent processes (process-group SIGTERM/SIGKILL on POSIX, `taskkill` on Windows). `cleanupRegisteredAgentProcesses(dataDir)` is called by the backend launcher on startup.                                                                                           |
| `*.test.ts`, `*.unit.test.ts` | Vitest specs colocated with each source module.                                                                                                                                                                                                                                                                                                         |

## For AI Agents

- Node/main-process code only — no DOM, no Electron imports. Pull host data from injected `AppMetadata` / `BackendBinaryResolver`, never from `electron`'s `app`.
- ESM package (`"type": "module"`): use explicit `.js` extensions in relative imports (see `index.ts`).
- `backend-launcher.ts` preserves the original Electron lifecycle behavior byte-for-byte (spawn args, health timeouts, restart window) — change runtime behavior with care and keep the desktop counterpart in sync.
- Proxy/route allowlist lives in `static-server.ts`; any new backend path must be added there or it will be served as a static 404.
- Tests run via `vitest run` (package `test` script); coverage and watch are configured in the package's `vitest.config.ts`.

## Dependencies

### Internal

Self-contained within the package (modules import each other via `./types.js`, `./backend-launcher.js`, `./agent-process-registry.js`).

### External

`serve-handler` (SPA static serving); Node built-ins `node:http`, `node:net`, `node:os`, `node:child_process`, `node:fs/promises`, `node:path`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
