<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# scripts

## Purpose

Repo-root build, packaging, dev-tooling, and CI/automation scripts for AionUi. Covers the electron-vite + electron-builder pipeline, native-module rebuilds, aioncore/hub resource fetching, the standalone WebUI CLI, i18n type generation/validation, performance benchmarks, and bash daemons that drive Claude-based PR/issue/Sentry automation.

## Key Files

| File                                                                                          | Description                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-with-builder.js`                                                                       | Top-level `npm run dist:*` driver coordinating electron-vite bundling + electron-builder; supports `--skip-vite`/`--skip-native`/`--pack-only`, incremental source-hash cache (`out/.build-hash`), macOS DMG retry on transient hdiutil failures. |
| `rebuildNativeModules.js`                                                                     | Unified native-module rebuild utility (`better-sqlite3`); `rebuildWithElectronRebuild`, `rebuildSingleModule`, `verifyModuleBinary`, `normalizeArch`, `getModulesToRebuild`, `buildEnvironment`. Uses `vx --with msvc` on Windows when available. |
| `afterPack.js`                                                                                | electron-builder afterPack hook: rebuilds native modules on Linux for cross-arch, verifies bundled aioncore resources via `shared-scripts`.                                                                                                       |
| `afterSign.js`                                                                                | electron-builder afterSign hook: macOS notarization via `@electron/notarize` (lazy ESM import).                                                                                                                                                   |
| `prepareAioncore.js` / `resolveAioncoreVersion.js`                                            | Download/stage the pinned `aioncore` backend binary; version order = `AIONUI_BACKEND_VERSION` env → `aioncoreVersion` in root package.json → `latest`.                                                                                            |
| `prepareHubResources.js`                                                                      | Downloads AionHub `index.json` + extension zips into `resources/hub/` as offline fallback.                                                                                                                                                        |
| `build-mcp-servers.js`                                                                        | esbuild-bundles builtin MCP server scripts into self-contained CJS for `app.asar.unpacked` (no ASAR require).                                                                                                                                     |
| `pack-web-cli.js` / `packaged-launch.mjs` / `dev-bootstrap.mjs`                               | web-cli tarball packaging; packaged-app launcher; dev port/process cleanup (`doctor` command, kills ports 5173/9230).                                                                                                                             |
| `webui.ts` / `resetpass.ts`                                                                   | Bun CLIs: launch standalone WebUI host (backend + static + auth, no Electron); reset WebUI admin password against SQLite `users`.                                                                                                                 |
| `generate-i18n-types.js` / `check-i18n.js`                                                    | Generate `i18n-keys.d.ts` from en-US locale modules; validate translation completeness across languages (pre-commit).                                                                                                                             |
| `check-agents-invoke.js`                                                                      | Static lint forbidding direct `acpConversation.getAvailableAgents.invoke` in renderer — enforces `useAgents()`/`getAgents()` SWR cache usage.                                                                                                     |
| `benchmark-startup.ts` / `benchmark-acp-startup.ts` / `run-benchmarks.ts`                     | Playwright Electron cold-startup + ACP agent-latency benchmarks; unified `vitest bench` runner with HTML report.                                                                                                                                  |
| `postinstall.js`                                                                              | Post-install native deps: skips rebuild in CI (prebuilt), runs `electron-builder install-app-deps` locally.                                                                                                                                       |
| `pr-automation.sh` (+ `.conf`), `fix-issues-daemon.sh`, `fix-sentry-daemon.sh`                | Bash daemons that loop launching Claude to triage/fix PRs, GitHub issues, and Sentry issues.                                                                                                                                                      |
| `install-web.sh` / `install-ubuntu.sh`                                                        | One-click end-user installers (curl-pipe-bash); `__VERSION__` placeholder is sed-substituted by CI.                                                                                                                                               |
| `prepare-managed-acp-tools.sh`                                                                | Stages managed Claude/Codex ACP tools to S3/CDN per target triple.                                                                                                                                                                                |
| `prepare-release-assets.sh` / `verify-release-assets.sh` / `create-mock-release-artifacts.sh` | Normalize/verify electron-updater `latest*.yml` metadata across multi-arch artifacts; mock artifacts for testing.                                                                                                                                 |
| `smoke-test-web-cli.sh` / `smoke-test-install-web.sh`                                         | Smoke tests for the web-cli tarball and the install-web.sh flow.                                                                                                                                                                                  |
| `README.md`                                                                                   | Build-script documentation (build flow, native rebuild strategy, troubleshooting).                                                                                                                                                                |

## Subdirectories

| Directory  | Purpose                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `codemods` | One-off AST/source transforms run with tsx (e.g. assistant snake_case migration) (see `codemods/AGENTS.md`). |

## For AI Agents

- These run under **Node/Bun at the repo root**, outside the Electron app — not subject to the main/renderer API split. `.js` files are CommonJS (`require`, `module.exports`); `.mjs`/`.ts` are ESM; `webui.ts`/`resetpass.ts` use the `#!/usr/bin/env bun` shebang.
- Paths are resolved relative to `__dirname`/`import.meta.url`, NOT cwd — keep that pattern when adding files.
- Shared logic lives in `packages/shared-scripts/src` (e.g. `prepare-aioncore`, `verify-bundled-aioncore-resources`); reuse it instead of duplicating.
- `rebuildNativeModules.js` is the single source of truth for native rebuilds — do not re-add per-hook rebuild logic (see README "Optimization History").
- `install-web.sh` contains a literal `__VERSION__` placeholder CI replaces via sed; never compare against that string in shell logic.
- Build coordination/version-pin constants must stay aligned with `packages/desktop/electron-builder.yml`, `package.json` (`aioncoreVersion`), and `packages/desktop/src/common/config/constants.ts` (e.g. `WEBUI_DEFAULT_PORT`).

## Dependencies

### Internal

`packages/shared-scripts/src` (prepare-aioncore, resource verification), `packages/web-host`, `packages/web-cli/src`, `packages/desktop/src/renderer/services/i18n` + `src/common/config/i18n-config.json` (i18n scripts), `packages/desktop/src/process/resources/builtinMcp` (MCP bundling).

### External

`esbuild`, `electron-builder` / `builder-util`, `@electron/notarize`, `playwright`, `@aionui/web-host`, `tsx`/Bun runtime; daemons shell out to `gh` CLI and the `claude` CLI.

<!-- MANUAL: notes below this line are preserved on regeneration -->
