<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# shared-scripts

## Purpose
The `@aionui/shared-scripts` workspace package holds CommonJS build/prepare scripts shared across AionUi packages. Its single public export is `./prepare-aioncore`, used to prepare the bundled aioncore runtime before builds.

## Key Files
| File | Description |
| --- | --- |
| `package.json` | Private workspace package `@aionui/shared-scripts` (`type: commonjs`). Exposes one export map entry `./prepare-aioncore` → `./src/prepare-aioncore.js`. Dev-deps only (`@types/node`, `vitest`); test scripts run via Vitest. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `src` | The actual script implementations: `prepare-aioncore.js` and `verify-bundled-aioncore-resources.js` (see `src/AGENTS.md`). |

## For AI Agents
- These are **Node.js CommonJS scripts** (`type: commonjs`), not part of the renderer bundle — Node APIs are fine here, DOM APIs are not.
- This package is `private` and consumed by other workspace packages via the `./prepare-aioncore` export. If you add a new script meant for external consumption, register it in the `exports` map in `package.json`, not just by file path.
- Keep `dependencies` empty — these scripts are intended to rely only on Node built-ins plus dev tooling.
- Tests run with Vitest (`bun run test` / `vitest run`).

## Dependencies
### External
`vitest` (dev/test), `@types/node` (dev types). Runtime relies on Node.js built-ins.

<!-- MANUAL: notes below this line are preserved on regeneration -->
