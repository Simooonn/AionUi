<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# unit

## Purpose
Vitest unit test suites for AionUi, organized to mirror the source tree (process utils, renderer utils/components, common config, providers, etc.). Each subdirectory targets a source area; direct files here cover cross-cutting main-process behaviors (GPU crash recovery, quit persistence, Sentry, window bounds).

## Key Files
| File | Description |
| --- | --- |
| `gpuRecovery.test.ts` | Tests `@/process/utils/gpuRecovery` threshold-based GPU crash self-healing: persists `disableHardwareAcceleration` after N crashes, 24h counter reset, user `force-on`/`force-off` overrides. Mocks `electron` `app` and uses a real temp `userData` dir. |
| `persistOnQuit.test.ts` | Tests `@/process/utils/persistOnQuit`: defers `app.quit` until tracked write promises settle (resolve or reject), via mocked `electron` `before-quit` event. Uses `__resetPersistOnQuitForTests`. |
| `windowBounds.test.ts` | Tests `@/process/utils/windowBounds` `resolveInitialBounds`/`loadSavedWindowBounds`/`attachWindowBoundsPersistence` decision tree (saved vs proportional defaults, MIN_WINDOW_* clamps) with stubbed `electron.screen` displays. |
| `sentry.test.ts` | Tests pure helpers from `@/sentry` (`selectRecentLogFiles`, `packAndCap`, `captureBackendStartupFailure`, `initSentry`). Mocks `electron`, `@sentry/electron/main`, `analyticsId`, `autoUpdateDiagnostics`; runs under the `node` Vitest project. |
| `messageFiles.test.ts` | Tests `@/renderer/utils/file/messageFiles` `buildDisplayMessage`: workspace-prefix handling, nested/external/relative paths, `_aionui_<ts>` timestamp stripping. |
| `updateBridgeCdnRewrite.test.ts` | Tests update-bridge CDN rewrite logic; mocks `@office-ai/platform` bridge/storage, `electron`, and `electron-updater`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `_helpers` | Shared test helpers/utilities for these suites (see `_helpers/AGENTS.md`) |
| `assets` | Tests for bundled assets (agentLogo, preset assistant/aioncore resources); not its own AGENTS.md |
| `assistants` | Assistant-related tests (see `assistants/AGENTS.md`) |
| `bootstrap` | App bootstrap / startup tests (see `bootstrap/AGENTS.md`) |
| `chat` | Chat feature tests (see `chat/AGENTS.md`) |
| `common` | Tests for `common/` shared code (see `common/AGENTS.md`) |
| `common-adapter` | Common adapter tests (see `common-adapter/AGENTS.md`) |
| `common-config` | Common config tests (see `common-config/AGENTS.md`) |
| `conversation` | Conversation tests (see `conversation/AGENTS.md`) |
| `cron` | Cron/scheduling tests (see `cron/AGENTS.md`) |
| `extension` | Extension tests (see `extension/AGENTS.md`) |
| `feedback` | Feedback tests (see `feedback/AGENTS.md`) |
| `preview` | Preview tests (see `preview/AGENTS.md`) |
| `previews` | Previews tests (see `previews/AGENTS.md`) |
| `providers` | Provider tests (see `providers/AGENTS.md`) |
| `renderer` | Renderer-side tests (see `renderer/AGENTS.md`) |
| `settings` | Settings tests (see `settings/AGENTS.md`) |
| `skills` | Skills tests (see `skills/AGENTS.md`) |
| `theme` | Theme tests (see `theme/AGENTS.md`) |
| `web-cli` | Web CLI tests (see `web-cli/AGENTS.md`) |
| `workspace` | Workspace tests (see `workspace/AGENTS.md`) |

## For AI Agents
- Import the code under test via path aliases (`@/process/...`, `@/renderer/...`, `@/sentry`), not relative paths into `packages/desktop/src`.
- Main-process suites must mock `electron` (and `electron-updater`, `@sentry/electron/main`, `@office-ai/platform` where used). Node-only suites (e.g. `sentry.test.ts`) run under the `node` Vitest project — keep them DOM-free.
- These suites favor real temp dirs (`fs.mkdtempSync` + `os.tmpdir()`) over mocking `fs`; clean up in `afterEach`. Use `vi.resetModules()` + dynamic `await import(...)` to re-evaluate module-level state between cases.
- Some modules expose `__reset*ForTests` helpers — call them in `beforeEach` to reset singletons rather than reaching into internals.
- Use `vi.hoisted(...)` for mock state referenced inside `vi.mock` factories (event-handler capture pattern in `persistOnQuit.test.ts`).

## Dependencies
### Internal
`@/process/utils/*` (gpuRecovery, persistOnQuit, windowBounds), `@/process/services/autoUpdateDiagnostics`, `@/process/utils/analyticsId`, `@/renderer/utils/file/messageFiles`, `@/sentry`
### External
`vitest`, `electron` (mocked), `@sentry/electron/main` (mocked), `electron-updater` (mocked), `@office-ai/platform` (mocked), node builtins `fs`/`path`/`os`/`node:zlib`/`node:crypto`

<!-- MANUAL: notes below this line are preserved on regeneration -->
