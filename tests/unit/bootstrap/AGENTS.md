<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# bootstrap

## Purpose

Vitest unit tests for AionUi's main-process startup/shutdown lifecycle: launching and supervising the bundled `aioncore` backend, classifying backend startup failures, running legacy SQLite migrations, configuring logging, and quit/restart cleanup. Each test pins the behavior of a single pure function or installer from `@/process/startup`, `@/process/utils`, or `@/process/services/database`.

## Key Files

| File                                 | Description                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backendStartup.test.ts`             | `startBackendOrExit` — registers the backend port on success; captures failure and exits with code 1 by default, honors `exitOnFailure: false`, and stays silent for `BackendStartupCancelledError`.                              |
| `backendStartupFailure.test.ts`      | `classifyBackendStartupFailure` (GLIBC mismatch, incomplete installation, macOS arch mismatch, generic bucket) plus `detectStartupArchitectureMismatch` (sysctl-based Rosetta detection) and `getDownloadLatestModalActionProps`. |
| `backendInstallDiagnostics.test.ts`  | `collectBackendInstallDiagnostics` reads a runtime manifest + missing-binary metadata; `appendAutoUpdateDiagnosticEvent` retains updater events and tracks `quitAndInstall`.                                                      |
| `backendLauncherParentPid.test.ts`   | `buildSpawnArgs` from `packages/web-host` passes `--parent-pid` through.                                                                                                                                                          |
| `buildWithBuilder.test.ts`           | Integration test that spawns `scripts/build-with-builder.js` with a `NODE_OPTIONS` require-hook to assert `prepareAioncore` receives the resolved `arch`.                                                                         |
| `runBackendMigrations.test.ts`       | `runBackendMigrations` / `resolveImageGenerationMigrationConfig` — built-in image-gen MCP bootstrap decisions, mocking ipc/http bridges and config migration helpers.                                                             |
| `configMigrationIntegration.test.ts` | `runLegacyDatabaseMigrations` happy path: version 20→26, runs migrations, seeds system user, closes driver.                                                                                                                       |
| `migrationErrorRecovery.test.ts`     | `runLegacyDatabaseMigrations` always closes the SQLite driver when initSchema/runMigrations/setDatabaseVersion/user-insert throw; skips when DB file absent.                                                                      |
| `configureConsoleLog.test.ts`        | `configureConsoleLog` disables stdout transport + sets file level `info` when packaged; keeps `silly` console level in dev. Uses `vi.doMock` + `vi.resetModules` per case.                                                        |
| `quitCleanup.test.ts`                | `installQuitCleanup` — prevents first before-quit until cleanup ordering completes, then re-requests quit; allows second before-quit afterward.                                                                                   |
| `restartApplication.test.ts`         | `restartApplication` returns `manualRestartRequired` in dev, calls `relaunch`/`exit(0)` when packaged.                                                                                                                            |
| `initStorage.migrations.test.ts`     | Placeholder/stub suite for storage migration branches; mocks `@office-ai/platform`, assertions are currently `expect(true).toBe(true)`.                                                                                           |

## For AI Agents

- These exercise **main-process** code (`@/process/*`, `packages/web-host`) — never DOM/renderer APIs. Path aliases `@/` and `@process/` resolve to `packages/desktop/src`.
- Tests are dependency-injection / pure-function style: SUTs accept callbacks (`startBackend`, `quitApp`, `stat`, `readFile`, `execFileSync`) instead of touching real `electron`/`fs`. Preserve that — supply fakes via args, not module mocks, where the SUT already takes injectables.
- For module-mock suites (`configMigration*`, `migrationErrorRecovery`, `runBackendMigrations`, `configureConsoleLog`), keep the `CURRENT_DB_VERSION = 26` and the hoisted `vi.mock`/`vi.hoisted` pattern consistent. `configureConsoleLog.test.ts` relies on `vi.resetModules()` + `vi.doMock` ordering and restores `console` in `afterEach`.
- Driver-cleanup tests assert `mockDriver.close()` is called on every throw path — when adding migration error cases, follow that close-always contract.
- `buildWithBuilder.test.ts` spawns a real Node subprocess and writes a temp require-hook; it is slower and OS-dependent (path separators, tmpdir).
- `initStorage.migrations.test.ts` is a stub — its `it` blocks assert nothing yet; fill in real assertions rather than copying its pattern.

## Dependencies

### Internal

`@/process/startup` (backendStartup, backendStartupFailure, backendInstallDiagnostics, architectureCompatibility, quitCleanup), `@/process/utils` (runBackendMigrations, configureConsoleLog), `@/process/services/database` (runLegacyDatabaseMigrations, schema, migrations, drivers), `@/process/bridge/restartApplication`, `@/process/services/autoUpdateDiagnostics`, `@/renderer/components/layout/InstallationIntegrityDialog`, `@/common/config/*`, `@/common/adapter/*`, `packages/web-host/src/backend-launcher`, `scripts/build-with-builder.js`.

### External

`vitest`, `electron`/`electron-log` (mocked), `@office-ai/platform` (mocked), `better-sqlite3` driver (mocked), Node built-ins (`node:child_process`, `node:fs`, `node:os`, `node:path`) in the build integration test.

<!-- MANUAL: notes below this line are preserved on regeneration -->
