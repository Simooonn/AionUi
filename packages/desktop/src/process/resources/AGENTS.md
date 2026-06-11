<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# resources

## Purpose

Main-process container for bundled runtime resources that ship with the app. Currently holds only `builtinMcp`, the built-in image-generation MCP server that AionUi registers as a default MCP tool.

## Subdirectories

| Directory    | Purpose                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `builtinMcp` | Built-in "aionui-image-generation" MCP server and its identity constants (`BUILTIN_IMAGE_GEN_ID` / `_NAME` / `_LEGACY_NAMES`), consumed by `process/utils/initStorage.ts` and `runBackendMigrations.ts` (see `builtinMcp/AGENTS.md`) |

## For AI Agents

- Main-process code — no DOM APIs.
- This directory itself has no direct source files; it is purely a grouping namespace. Add new bundled resources here as sibling subdirectories rather than loose files.
- `BUILTIN_IMAGE_GEN_*` constants are intentionally duplicated in `@/common/config/storage` (the shared/renderer-facing copy). When changing the built-in MCP id/name, keep both copies in sync and account for legacy names used in config migrations.

## Dependencies

### Internal

- Consumed by `packages/desktop/src/process/utils` (`initStorage.ts`, `runBackendMigrations.ts`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
