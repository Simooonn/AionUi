<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose
Source for the `aionui-web` CLI — a Node/bun standalone binary that serves the AionUi WebUI without Electron. It resolves tarball-sibling assets (static SPA, bundled `aioncore` backend), spawns the web host, and manages first-launch admin-password seeding.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | CLI entry. Parses `start`/`resetpass`/`version`/`help` commands and flags/env overrides; resolves `cliRoot` via `process.execPath` (bun `--compile` virtual fs) or `import.meta.url` (dev). `runStart` boots `startWebHost` (or `startStaticServer` in frontend-only mode when the backend binary is missing) and wires SIGINT/SIGTERM shutdown. `runResetPassword` boots the backend on an ephemeral port, POSTs `/api/webui/reset-password`, prints the new password, then tears down. |
| `browser.ts` | Auto-open-browser logic. `shouldAutoOpenBrowser` decides from `--open`/`--no-open`/`AIONUI_OPEN_BROWSER`/`allowRemote`; `buildOpenBrowserCommand` maps platform to `open`/`cmd start`/`xdg-open`; `openBrowserUrl` runs it via `spawnSync` and returns a `{ ok }` result. Deps are injectable for testing. |
| `ensureAdminPassword.ts` | First-launch credential bootstrap. Polls `/api/auth/status` for `needs_setup`; if set, POSTs `/api/webui/reset-password` and prints `Generated initial admin password: <pw>`. Never throws — failures are warned so startup continues. All side effects (`fetch`, `log`, `warn`, `sleep`, `now`) are injected via `EnsureAdminPasswordDeps`. |

## For AI Agents
- This is a **Node-process CLI**, not the desktop Main/Renderer split — no DOM, no Electron APIs. Use `node:` built-ins and the `@aionui/web-host` interface only.
- The printed string `Generated initial admin password: <pw>` and the `username: ...` lines are **load-bearing**: `scripts/smoke-test-web-cli.sh` greps for them. Do not reword without updating that script.
- `ensureAdminPassword` mirrors Electron's `maybeSeedInitialPassword` (`packages/desktop/src/process/bridge/webuiBridge.ts`) and the bun helper in `scripts/webui.ts` — keep all three in sync.
- Path resolution must keep the `process.execPath` heuristic (`aionui-web`/`aionui-web.exe`); `import.meta.url` points into bun's virtual `/$bunfs/` when compiled.
- Backend/data/port/static dirs all support flag → env → default precedence (`AIONUI_*` vars); preserve that order when adding options.
- `browser.ts` and `ensureAdminPassword.ts` use dependency injection precisely so they are unit-testable — keep new logic pure and inject I/O.

## Dependencies
### Internal
- `@aionui/web-host` — `startWebHost` / `startStaticServer` and their handle types (the actual HTTP server + backend supervisor).
### External
- `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url`, `node:timers/promises`; global `fetch`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
