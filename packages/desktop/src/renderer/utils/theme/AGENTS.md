<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# theme

## Purpose

Renderer-side helpers that apply a resolved theme and font-size settings to a `Document`. They write theme tokens, decoration CSS, and font-size CSS variables into the live DOM, and process user-supplied custom CSS before injection. Used by every app-chrome window surface.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applyTheme.ts`         | `applyTheme(theme, root)` sets `data-theme`/`arco-theme` attributes and upserts two `<style>` elements (`theme-tokens`, `theme-decoration`). `setActiveTheme(activeId)` resolves the active theme from builtin + user themes, applies it, persists `theme.activeId`, and broadcasts via `ipcBridge.theme.setActive`. |
| `applyFontSizes.ts`     | `applyFontSizes(sizes, root)` writes clamped font-size values to root CSS variables (per `FONT_SIZE_SPECS[key].cssVar`); variables cross into Markdown shadow roots via ShadowView injection.                                                                                                                        |
| `customCssProcessor.ts` | Processes user custom CSS: `addImportantToAll` appends `!important` to every declaration, `wrapCustomCss` adds header comments, `processCustomCss` composes both, and `validateCss` does brace-pairing/property sanity checks.                                                                                       |

## For AI Agents

- Renderer-only code (NO Node.js APIs). All functions take an optional `root: Document = document` so they can target child windows / popups, not just the main document.
- Theme persistence and cross-window sync go through `configService` and `ipcBridge.theme.setActive` — do not write directly to DOM-stored state.
- `upsertStyle` re-appends the `<style>` to `<head>` on every update to keep it last (cascade priority); preserve that behavior. Style elements are keyed by fixed IDs (`theme-tokens`, `theme-decoration`).
- `customCssProcessor.ts` deliberately keeps Chinese JSDoc comments; `validateCss` is intentionally a lightweight check (brace count + presence of `:`), not a real CSS parser.

## Dependencies

### Internal

- `@/common/config/fontSizes`, `@/common/config/configService`, `@/common/theme/types`, `@/common/theme/resolveTheme`, `@/common` (ipcBridge)
- `@renderer/theme/builtinThemes`

<!-- MANUAL: notes below this line are preserved on regeneration -->
