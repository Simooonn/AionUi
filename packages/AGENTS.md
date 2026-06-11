<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# packages

## Purpose

Workspace root for AionUi's npm/bun workspaces (root `package.json` declares `"workspaces": ["packages/*"]`). Each subdirectory is a private workspace package linked via `workspace:*`. Splits the codebase into the Electron desktop app, a non-Electron web runtime, and shared build tooling.

## Subdirectories

| Directory        | Purpose                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop`        | `@aionui/desktop` — the Electron application (main/renderer/preload processes); root `main` and `dev` scripts point here (see `desktop/AGENTS.md`)                                             |
| `shared-scripts` | `@aionui/shared-scripts` — CommonJS build helpers shared across packages; exports `./prepare-aioncore` (see `shared-scripts/AGENTS.md`)                                                        |
| `web-cli`        | `@aionui/web-cli` — standalone WebUI runtime with no Electron; provides the `aionui-web` bin (see `web-cli/AGENTS.md`)                                                                         |
| `web-host`       | `@aionui/web-host` — WebUI host that spawns the backend, reverse-proxies to it, and serves static files via `serve-handler`; depended on by `desktop` and `web-cli` (see `web-host/AGENTS.md`) |

## For AI Agents

- This directory itself has no source files — all code lives in the four workspace packages. Do not add files directly under `packages/`.
- Cross-package imports use the workspace alias (`@aionui/web-host`, `@aionui/shared-scripts`), not relative paths. Dependency direction observed: `web-cli` → `web-host` + `shared-scripts`; `desktop` → `web-host`.
- The Electron process-separation rule (main = no DOM, renderer = no Node.js) applies inside `desktop` only. `web-host`/`web-cli`/`shared-scripts` are Node-side packages with no renderer constraint.
- `web-host`/`web-cli` are ESM (`"type": "module"`); `shared-scripts` is CommonJS (`"type": "commonjs"`). Match the package's module system when adding files.
- Each package has its own `vitest run` test script; run tests from within the relevant package.

## Dependencies

### External

serve-handler (web-host), vitest, typescript, @types/node

<!-- MANUAL: notes below this line are preserved on regeneration -->
