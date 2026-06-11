<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# startup

## Purpose

Main-process helpers that orchestrate the app lifecycle around the bundled `aioncore` backend: detecting macOS package/architecture mismatches, starting the backend (or exiting on failure), classifying startup failures into structured reasons, collecting install diagnostics, and running graceful quit cleanup. All modules are written as pure, dependency-injected functions so they can be unit-tested without a real Electron environment.

## Key Files

| File                           | Description                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architectureCompatibility.ts` | Detects when an x64-packaged build runs on Apple Silicon (via `sysctl` `proc_translated` / `hw.optional.arm64`). Exports `detectStartupArchitectureMismatch`, `assertStartupArchitectureCompatible`, and `StartupArchitectureMismatchError` (carries `details.stage = 'startup_architecture_check'`). |
| `backendStartup.ts`            | `startBackendOrExit(options)` wraps `startBackend()`, calls `onStarted(port)` on success, swallows `BackendStartupCancelledError`, otherwise captures the failure and exits (code 1) unless `exitOnFailure` is false.                                                                                 |
| `backendStartupFailure.ts`     | `classifyBackendStartupFailure(error)` maps a raw error + its `details` into a typed `BackendStartupFailureInfo`: architecture mismatch, incomplete installation (missing `bundled-aioncore/`, runtime dir, `managed-resources/`, or binary), missing GLIBC versions, or generic failure.             |
| `backendInstallDiagnostics.ts` | `collectBackendInstallDiagnostics(details, env)` builds a `BackendInstallDiagnostics` record by resolving binary/manifest paths under `resources/bundled-aioncore/<runtimeKey>/`, stat-ing them, and parsing `manifest.json`.                                                                         |
| `quitCleanup.ts`               | `installQuitCleanup(deps)` registers a `before-quit` handler that runs once: stops backend, destroys tray/pet window, disposes the cron resume listener, races cleanup against a 10s timeout, then quits.                                                                                             |

## For AI Agents

- Main process only — no DOM APIs. Files import `node:child_process`, `node:fs`, `node:path` directly.
- Every module takes injected dependencies (an `env`/`deps`/`options` object) with sensible `process.*` / `fs` defaults. When adding logic, keep the seam: accept overridable functions so tests can stub them — do not hard-call Electron `app` here.
- Failure-detail contracts are string-keyed and load-bearing: `details.stage` values (`'startup_architecture_check'`, `'resolve_binary'`), directory markers like `'bundled-aioncore/'`, `'managed-resources/'`, `'app.asar'`, and `MAX_REPORTED_DIR_ENTRIES = 20` must stay in sync with whatever code throws these errors. Changing a key here silently breaks classification.
- `BackendStartupFailureInfo` and the architecture details shape are shared with the renderer via `@/common/types/platform/electron`; keep additions type-safe (strict mode, no `any`).
- These are helpers, not the entry point — the actual `app` wiring lives in the parent `process/` modules that call these functions.

## Dependencies

### Internal

- `@/common/types/platform/electron` (`BackendStartupFailureInfo`)

### External

- Node builtins: `node:child_process`, `node:fs`, `node:path`

<!-- MANUAL: notes below this line are preserved on regeneration -->
