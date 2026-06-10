<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# web-cli

## Purpose
Unit tests for the `packages/web-cli` package — the standalone CLI that launches the AionUi web UI. Covers browser auto-open decisions/platform launchers and the admin-password bootstrap flow that talks to the backend auth API.

## Key Files
| File | Description |
| --- | --- |
| `browser.test.ts` | Tests `shouldAutoOpenBrowser`, `buildOpenBrowserCommand`, and `openBrowserUrl` from `packages/web-cli/src/browser.js`: open/no-open flag and `AIONUI_OPEN_BROWSER` env precedence, per-platform opener commands (macOS `open`, Windows `cmd /c start`, Linux `xdg-open`), and success/failure/unsupported-platform spawn results. |
| `ensureAdminPassword.test.ts` | Tests `ensureAdminPassword` from `packages/web-cli/src/ensureAdminPassword.js`: seeding the initial admin password on fresh install (`needs_setup`), nested vs top-level response field parsing, no-op when already provisioned, polling `/api/auth/status` until ready, username fallback to `admin`, `resetCommand` hint customization, and warn-not-throw behavior on backend failures. |

## For AI Agents
- Pure dependency-injection style: SUTs accept an explicit deps object so no real network or `child_process` is touched.
- `ensureAdminPassword.test.ts` uses a local `makeDeps` factory that records `fetch` calls, `log`/`warn` output, and `sleep` durations, plus a `mockResponse(status, body)` helper that builds real `Response` objects. Handlers are consumed in order, reusing the last handler when exhausted.
- `browser.test.ts` injects `spawnSync` via `vi.fn()` and asserts the spawned command/args/options rather than spawning processes.
- Imports target compiled `.js` paths under `packages/web-cli/src/`. Run via `bun run test` or `bunx vitest run tests/unit/web-cli`.

## Dependencies
### Internal
- `packages/web-cli/src/browser.js`, `packages/web-cli/src/ensureAdminPassword.js`
### External
- `vitest` (`describe`/`it`/`expect`/`vi`); global `Response`/`fetch`/`RequestInit` web types.

<!-- MANUAL: notes below this line are preserved on regeneration -->
