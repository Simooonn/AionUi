<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# process

## Purpose

The Electron **main process** root for the AionUi desktop app. This is the Node.js-side codebase that boots the app, registers the IPC bridge, manages backend AI agents, native windows/services, and storage. No DOM APIs are allowed here.

## Key Files

| File       | Description                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Main-process bootstrap. Registers the Electron platform shim and Chromium config (imported first, before other modules), sets `PREBUILDS_ONLY=1` for packaged builds so `node-gyp-build` loads only `prebuilds/`, wires `initBridge` and main-process i18n, and exports `initializeProcess()` which awaits `initStorage()` with timing marks logged via `[AionUi:process]`. |

## Subdirectories

| Directory   | Purpose                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `backend`   | AI agent/backend integration and execution logic (see `backend/AGENTS.md`).               |
| `bridge`    | IPC bridge handler implementations exposed to the renderer (see `bridge/AGENTS.md`).      |
| `feedback`  | User feedback collection/reporting (see `feedback/AGENTS.md`).                            |
| `pet`       | Desktop pet feature windows/logic (see `pet/AGENTS.md`).                                  |
| `resources` | Bundled main-process resources (see `resources/AGENTS.md`).                               |
| `services`  | Cross-cutting main-process services, e.g. i18n initialization (see `services/AGENTS.md`). |
| `startup`   | App startup/lifecycle and window bootstrap (see `startup/AGENTS.md`).                     |
| `utils`     | Main-process utilities: storage, bridge init, Chromium config (see `utils/AGENTS.md`).    |

## For AI Agents

- **Main process only**: never import DOM/`window`/renderer APIs here. Communicate with the renderer through the IPC bridge (`packages/desktop/src/preload`).
- **Import ordering matters in `index.ts`**: `@/common/platform/register-electron` and `@process/utils/configureChromium` must stay first — they set the app name and Chromium flags before any other module initializes. The `PREBUILDS_ONLY` guard must run before `initStorage` is imported.
- `initializeProcess()` is async and side-effect ordered; add new boot steps inside it (after `initStorage`) with a `mark()` call for startup timing visibility.

## Dependencies

### Internal

`@/common/platform/register-electron`, `@process/utils` (`configureChromium`, `initStorage`, `initBridge`), `./services/i18n`

### External

`electron`

<!-- MANUAL: notes below this line are preserved on regeneration -->
