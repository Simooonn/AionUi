<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# presets

## Purpose

Raw CSS source files for AionUi's built-in appearance themes. Each file redefines the app's CSS custom properties (color tokens, backgrounds, message/component colors) under `:root` and `[data-theme='dark']`, sometimes with additional component selector overrides. They are imported as raw strings (`?raw`) by `@renderer/theme/builtinThemes.ts` and surfaced as selectable themes in the AppearanceSettings UI.

## Key Files

| File                                 | Description                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default.css`                        | AOU Purple default theme. Documents the full set of token names (primary/brand/bg/fill/text/border/semantic/message) with light `:root` and `[data-theme='dark']` values; the reference template for customization. |
| `discourse-horizon.css`              | Largest preset; Discourse-Horizon styled theme with extensive component overrides.                                                                                                                                  |
| `retroma-y2k.css`                    | Retro Y2K theme with chip-style markdown emphasis (the "calmer chip" logic other retroma presets reference).                                                                                                        |
| `retro-windows.css`                  | Retro Windows skin theme.                                                                                                                                                                                           |
| `misaka-mikoto.css`                  | Character theme (Misaka Mikoto).                                                                                                                                                                                    |
| `hello-kitty.css`                    | Pink cute theme; uses namespaced `--hk-*` vars mapped onto the standard tokens, light/dark modes.                                                                                                                   |
| `glittering-input-field.css`         | Theme emphasizing a styled chat input field.                                                                                                                                                                        |
| `retroma-obsidian-book.css`          | Base Retroma Obsidian Book theme.                                                                                                                                                                                   |
| `retroma-obsidian-book-2.css`        | Patch on top of the base; tweaks markdown `strong`/`mark`/inline-`code` toward Y2K chip behavior.                                                                                                                   |
| `retroma-obsidian-book-2-1-dark.css` | Dark-focused variant of the Obsidian Book 2 patch.                                                                                                                                                                  |
| `retroma-nocturne-parchment.css`     | Nocturne Parchment Retroma variant.                                                                                                                                                                                 |

## For AI Agents

- Renderer-side assets — pure CSS, no JS/TS or Node APIs here. Do not add logic; these are theme definitions only.
- New presets are not auto-discovered: after adding a `.css` file you must add a matching `?raw` import and theme entry in `@renderer/theme/builtinThemes.ts`, and (if it needs a preview image) wire a cover in `../themeCovers.ts`.
- Override CSS variables under both `:root` (light) and `[data-theme='dark']` to support both modes; mirror the token names defined in `default.css`.
- Component overrides commonly target markdown/message selectors (`.message-content`, `.markdown-body`, `.markdown-shadow-body`, `[class*='markdown']`) and rely heavily on `!important` plus `-webkit-text-fill-color` to win specificity. Follow that pattern when editing existing presets.
- Background images are injected separately by the parent (`backgroundUtils.ts` / `BACKGROUND_BLOCK_START`); avoid hand-writing background blocks that collide with that mechanism.

## Dependencies

### Internal

- Consumed by `@renderer/theme/builtinThemes.ts` (raw imports); covers in `../themeCovers.ts`; selection UI in `../CssThemeSettings.tsx`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
