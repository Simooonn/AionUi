<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# desktop

## Purpose
The Electron desktop application package (`@aionui/desktop`). Holds the electron-vite build config, electron-builder packaging config, and all desktop source under `src/` (main process, preload, renderer, and shared common code). This package produces the distributable AionUi desktop app for Windows, macOS, and Linux.

## Key Files
| File | Description |
| --- | --- |
| `electron.vite.config.ts` | electron-vite config for the three build targets (`main`, `preload`, `renderer`). Defines path aliases (`@`, `@common`, `@renderer`, `@process`, `@worker`), the `iconParkPlugin` that wraps `@icon-park/react` imports with `IconParkHOC`, MCP-server post-build hook, UnoCSS, manual vendor chunk splitting, CodeMirror/React dedupe, and Sentry source-map upload. Injects `__APP_VERSION__` from the repo-root `package.json`. |
| `electron-builder.yml` | Packaging config: appId `com.aionui.app`, `aionui` URL protocol, per-platform targets (nsis/zip win, dmg/zip mac, deb linux), native-module asarUnpack rules (better-sqlite3, bcrypt, node-pty, tree-sitter WASM), extraResources (bundled-aioncore, hub), and GitHub publish. |
| `package.json` | Workspace-internal manifest. Version is a frozen `0.0.0` placeholder — never use it for user-visible version strings (use root `package.json`). `main` points to `../../out/main/index.js`; depends on `@aionui/web-host`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `src` | All desktop source: main process, preload IPC bridge, renderer UI, and shared common code (see `src/AGENTS.md`). |

## For AI Agents
- This directory holds config only; actual code lives in `src/`. When changing build behavior, edit `electron.vite.config.ts`, not files in `out/`.
- The two version sources matter: `packages/desktop/package.json` is a `0.0.0` placeholder; the real version comes from the repo-root `package.json` and is injected as `__APP_VERSION__` for the renderer.
- Build entry points are explicit per target — main at `src/index.ts`, preload at `src/preload/main.ts` plus three pet preloads, renderer at the HTML files under `src/renderer`. Adding a new preload or renderer page requires registering it in `rollupOptions.input` here.
- Aliases are duplicated across `main`/`preload`/`renderer` config blocks; keep them in sync when adding one.
- Native modules and tree-sitter binaries are deliberately excluded/re-included in `electron-builder.yml` for code-signing/notarization; do not loosen these globs casually.

## Dependencies
### Internal
`@aionui/web-host` (workspace dependency); references `../../uno.config.ts`, `../../package.json`, and `scripts/build-mcp-servers.js`.
### External
`electron-vite`, `unocss`, `@sentry/vite-plugin`, `vite-plugin-static-copy`, `electron-builder` (config consumer).

<!-- MANUAL: notes below this line are preserved on regeneration -->
