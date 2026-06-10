<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# web-cli

## Purpose
Standalone Node.js CLI package (`@aionui/web-cli`) that runs the AionUi WebUI as a web runtime without Electron. Exposes the `aionui-web` binary and re-exports the runtime entry from `src/index.ts`. Built with plain `tsc` to `dist/` (ESM, NodeNext, target ES2022).

## Key Files
| File | Description |
| --- | --- |
| `package.json` | Defines `@aionui/web-cli` (private, ESM). Registers the `aionui-web` bin → `./bin/aionui-web.js`, exports `.` → `./src/index.ts`. Depends on workspace packages `@aionui/shared-scripts` and `@aionui/web-host`; scripts build via `tsc` and test via `vitest`. |
| `tsconfig.json` | Standalone compiler config: `rootDir` `./src`, `outDir` `./dist`, `module`/`moduleResolution` NodeNext, `types: ["node"]`, strict mode, no declarations, source maps on. Excludes `**/*.test.ts`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `bin` | Executable entry shipped as the `aionui-web` CLI command (see `bin/AGENTS.md`). |
| `src` | TypeScript runtime source compiled to `dist/`; barrel exported as the package entry (see `src/AGENTS.md`). |

## For AI Agents
- Node-only package — no DOM and no Electron APIs here. It wires the web host into a standalone CLI runtime.
- This package builds with plain `tsc` (its own `tsconfig.json`), not the desktop bundler. Keep imports NodeNext-resolvable and use ESM syntax (`"type": "module"`).
- Cross-package code comes in via workspace deps; import from `@aionui/web-host` / `@aionui/shared-scripts` rather than reaching into sibling source paths.
- Tests use Vitest and are excluded from the build (`**/*.test.ts`); run `vitest run` within this package.

## Dependencies
### Internal
- `@aionui/web-host` (workspace) — web runtime/host logic.
- `@aionui/shared-scripts` (workspace) — shared script utilities.
### External
- `typescript` (build), `vitest` (test), `@types/node` (typings).

<!-- MANUAL: notes below this line are preserved on regeneration -->
