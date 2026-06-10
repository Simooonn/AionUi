<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# e2e

## Purpose
Playwright + Electron end-to-end test suite for the AionUi desktop app. Launches the real packaged or dev Electron build, drives the renderer like a user, and asserts both UI state and main-process backend state. The app is launched once per worker as a singleton and reused across all spec files.

## Key Files
| File | Description |
| ---- | ----------- |
| `fixtures.ts` | Core Playwright fixtures. Extends `base` with `electronApp` (singleton Electron instance) and `page` (resolved main, non-DevTools renderer window). Handles packaged vs dev launch mode, app crash relaunch, on-failure screenshot attachment, and worker-exit cleanup of the temp extension-state sandbox. Re-exports `test` and `expect`. |
| `README.md` | E2E testing guide: build/PATH prerequisites (`aioncore` must be on PATH for `__backendPort`), launch modes, env vars, `invokeBridge` usage rules, timeout guidelines, Shadow DOM / dialog mocking patterns, npm scripts, troubleshooting. |

## Subdirectories
| Directory | Purpose |
| --------- | ------- |
| `cases` | (see `cases/AGENTS.md`) |
| `docs` | (see `docs/AGENTS.md`) |
| `features` | (see `features/AGENTS.md`) |
| `helpers` | (see `helpers/AGENTS.md`) |
| `specs` | (see `specs/AGENTS.md`) |

## For AI Agents
- Import `test` and `expect` from `../fixtures` (NOT directly from `@playwright/test`) so tests get the Electron-aware `page`/`electronApp` fixtures.
- The Electron app is a singleton shared across every describe block — a relaunch costs ~25-30s. Do NOT add `test.afterAll` cleanup that would close the app; cleanup is registered on `process.beforeExit`/`exit` only.
- E2E tests load static files from `out/`, not the Vite dev server. Source changes require `bunx electron-vite build` before they take effect.
- Launch mode: dev locally, packaged in CI (`process.env.CI`). Override with `E2E_PACKAGED=1` / `E2E_DEV=1`.
- `fixtures.ts` runs in the Playwright runner (Node context) and uses `path`, `fs`, `os`, and the `playwright` `_electron` API — Node APIs are expected here, unlike the renderer source under `packages/desktop/src/renderer`.
- AI message text renders inside Shadow DOM (`.markdown-shadow`); use helpers (e.g. `waitForAiReply`) rather than plain text locators.
- Per README convention, `invokeBridge` is for setup/assert/cleanup state only — user-facing operations must go through actual UI interaction.

## Dependencies
### External
`@playwright/test`, `playwright` (`_electron`), Node builtins `path`, `fs`, `os`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
