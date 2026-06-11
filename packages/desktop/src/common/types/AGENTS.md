<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# types

## Purpose

Shared TypeScript type definitions used across both desktop processes. The direct files here are ambient `declare module` shims that supply types for npm packages shipping without their own declarations; the subdirectories group domain type definitions (agents, IPC channels, providers, teams, etc.).

## Key Files

| File                       | Description                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pptx2json.d.ts`           | Ambient `declare module 'pptx2json'` — types the default `PPTX2Json` class (`toJson`, `toPPTX`, `getMaxSlideIds`, `getSlideLayoutTypeHash`).      |
| `turndown-plugin-gfm.d.ts` | Ambient `declare module 'turndown-plugin-gfm'` — types the `gfm`, `strikethrough`, `tables`, and `taskListItems` plugin functions for `turndown`. |

## Subdirectories

| Directory  | Purpose                                                        |
| ---------- | -------------------------------------------------------------- |
| `agent`    | Agent-related type definitions (see `agent/AGENTS.md`).        |
| `channel`  | IPC channel type definitions (see `channel/AGENTS.md`).        |
| `codex`    | Codex integration type definitions (see `codex/AGENTS.md`).    |
| `office`   | Office document type definitions (see `office/AGENTS.md`).     |
| `platform` | Platform-specific type definitions (see `platform/AGENTS.md`). |
| `provider` | Model/AI provider type definitions (see `provider/AGENTS.md`). |
| `team`     | Team type definitions (see `team/AGENTS.md`).                  |

## For AI Agents

- This is `common`, shared by both Main and Renderer — keep types process-agnostic; never reference DOM- or Node-only globals in declarations placed here.
- The two direct `.d.ts` files are stop-gap shims for untyped third-party packages. `pptx2json.d.ts` deliberately uses `any` in its package surface; do not "fix" that to satisfy strict-mode rules unless you are upstreaming real types. Prefer narrowing at call sites instead.
- When a third-party package gains official types, remove its shim here rather than keeping a duplicate declaration.

## Dependencies

### External

`pptx2json`, `turndown` / `turndown-plugin-gfm` (types only; no runtime imports in this directory).

<!-- MANUAL: notes below this line are preserved on regeneration -->
