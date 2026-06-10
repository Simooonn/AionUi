<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# bin

## Purpose
Holds the executable entry point for the `@aionui/web-cli` package — the standalone WebUI CLI runtime (no Electron). The `aionui-web` bin declared in `package.json` points here.

## Key Files
| File | Description |
| --- | --- |
| `aionui-web.js` | Node shebang launcher (`#!/usr/bin/env node`). Dynamically `import('../src/index.js')` (the compiled CLI), and on rejection logs `Failed to start aionui-web:` and exits with code 1. |

## For AI Agents
- This is a Node CLI launcher, not Electron/renderer code — Node.js APIs are allowed, no DOM APIs.
- The launcher imports the **compiled** `../src/index.js`, not the `.ts` source. Run `bun run build` (tsc) in `packages/web-cli` before the bin can run; editing `src/index.ts` alone will not take effect.
- Keep this file thin: it only bootstraps and surfaces startup errors. Real logic belongs in `../src/`.
- It is ESM (`"type": "module"` in `package.json`); use `import()`, not `require`.

## Dependencies
### Internal
- `../src/index.js` (compiled output of `packages/web-cli/src/index.ts`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
