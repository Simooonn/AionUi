<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# shims

## Purpose
Build-time replacement modules for third-party packages whose bundling needs special handling. Currently holds a single shim that re-exports the `@xterm/headless` `Terminal` class from the package's internal headless build path, sidestepping the bundler alias that would otherwise create a circular reference.

## Key Files
| File | Description |
| --- | --- |
| `xterm-headless.ts` | `require`s `@xterm/headless/lib-headless/xterm-headless.js` (a deep path that bypasses the `@xterm/headless` alias) and re-exports its `Terminal` as both a named and default export. |

## For AI Agents
- `electron.vite.config.ts` aliases `@xterm/headless` to this file, so any code importing `@xterm/headless` resolves here. Do not rename or move this file without updating that alias.
- The deep `lib-headless/xterm-headless.js` require path is deliberate — it dodges the alias to reach the real package. Keep the inline comment and use the explicit subpath; importing the bare `@xterm/headless` here would self-reference.
- `require` (not `import`) is used on purpose; the matching `@xterm/headless/lib-headless/xterm-headless.js` ambient declaration lives in `packages/desktop/src/types.d.ts`. There is no `index.ts` barrel.
- This is shared `common` code but loads a Node-oriented terminal lib — consumed by the Main process side.

## Dependencies
### External
- `@xterm/headless` (resolved via its internal `lib-headless/xterm-headless.js` entry)

<!-- MANUAL: notes below this line are preserved on regeneration -->
