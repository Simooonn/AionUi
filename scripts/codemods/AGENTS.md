<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# codemods

## Purpose

One-off `ts-morph` codemod scripts run from the repo root to perform repo-wide TypeScript AST rewrites. Currently holds the migration that renamed camelCase Assistant fields to snake_case across the codebase.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistantSnakeCase.ts` | Renames Assistant-shaped fields (`nameI18n`→`name_i18n`, `sortOrder`→`sort_order`, etc. per `FIELD_MAP`) repo-wide. Loads the project via `tsconfig.json`, then for each non-`node_modules` source file rewrites (a) property accesses, (b) object-literal keys, and (c) destructuring bindings — but only when the receiver/contextual/initializer type resolves to one of the `ASSISTANT_TYPES` (`Assistant`, `CreateAssistantRequest`, etc.). Skips `assistantTypes.ts` (already migrated by hand). Calls `project.saveSync()` and logs counts of flipped accesses/literals/destructurings. |

## For AI Agents

- This is a build/tooling script (Node context), not Electron Main or Renderer — no DOM and no IPC concerns apply.
- It mutates source files in place via `project.saveSync()`. Treat it as a destructive one-shot: only run on a clean working tree so the diff is reviewable, and re-running after migration is a no-op only because types already changed.
- Type-shape gating (`targetIsAssistantShape`) walks unions and array element types but NOT promises despite the comment claiming so — extend that helper if you need promise-unwrap or intersection coverage.
- Destructuring rewrites add an alias (`{ sort_order: sortOrder }`) rather than renaming the local binding, so downstream identifier usage is preserved.
- When adding a new codemod, mirror this structure: a self-contained `.ts` file constructed from `tsConfigFilePath: 'tsconfig.json'`, run from the project root.

## Dependencies

### External

- `ts-morph` — `Project`, `SyntaxKind`, and the `Type` API for AST traversal and in-place edits.

<!-- MANUAL: notes below this line are preserved on regeneration -->
