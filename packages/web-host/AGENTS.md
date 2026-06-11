<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# web-host

## Purpose

`@aionui/web-host` is a standalone WebUI host package with **zero Electron dependency**. It spawns or reuses an aioncore backend process, serves the `out/renderer` SPA, reverse-proxies `/api` and `/ws` to that backend, and provides password-based auth (reset/change/verify, bcrypt + session). It lets AionUi's renderer run as a plain web app outside the desktop shell.

## Key Files

| File               | Description                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`        | Package overview: responsibilities (backend-launcher, static-server, auth), `startWebHost()` usage example, and current status (M3 skeleton with placeholder implementations that throw `not implemented yet`). |
| `package.json`     | `@aionui/web-host` (private, ESM). Exports `./src/index.ts`. Runtime dep `serve-handler`; test via `vitest run`.                                                                                                |
| `tsconfig.json`    | Extends repo root config; `rootDir: ./src`, `outDir: ./dist`, excludes `*.test.ts`.                                                                                                                             |
| `vitest.config.ts` | Node-env Vitest; includes `src/**/*.{test,unit.test}.ts` and `tests/**/*.test.ts`; 10s timeout.                                                                                                                 |

## Subdirectories

| Directory | Purpose                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `src`     | Package source: `startWebHost` entry, backend launcher, static server, and auth modules (see `src/AGENTS.md`). |
| `tests`   | Vitest test suites for the package (see `tests/AGENTS.md`).                                                    |

## For AI Agents

- This package is intentionally **Electron-free** — do not import `electron` or any desktop-shell APIs here. It runs in a plain Node.js process.
- Node-only context: `serve-handler` serves static files and the host reverse-proxies to aioncore. No DOM APIs in this package.
- Status is **M3 skeleton**: most implementations are placeholders that throw `not implemented yet`. Verify a function is actually implemented before relying on it.
- Public entry is `startWebHost(...)` returning a handle with `url` and `stop()`. Keep the exported API surface in `src/index.ts`.
- ESM package (`"type": "module"`) — use ESM import syntax.

## Dependencies

### External

`serve-handler` (static file serving + SPA), `vitest` (tests), `@types/node`, `@types/serve-handler`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
