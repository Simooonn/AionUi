<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# theme

## Purpose

Renderer-side registry of built-in themes. Assembles the `BUILTIN_THEMES` array consumed by the appearance/theming system: two base appearance themes (Light, Dark) plus several decorative preset themes whose CSS is imported raw and paired with cover images.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builtinThemes.ts` | Exports `BUILTIN_THEMES: Theme[]` and `BUILTIN_THEME_IDS: Set<string>`. Uses a local `decorative()` helper to build `Theme` objects (`builtin: true`, fixed `created_at`/`updated_at = 0`). Imports preset CSS via Vite `?raw` and cover images from `AppearanceSettings/themeCovers`. Light/Dark use shared IDs from `@/common/theme/constants`. |

## For AI Agents

- Renderer-only code — no Node.js APIs.
- The `Theme` type and `LIGHT_THEME_ID`/`DARK_THEME_ID` constants live in shared `@/common/theme`; this file only registers data, it does not define the theme schema.
- CSS presets are pulled with Vite's `?raw` import suffix; adding a new decorative theme means adding a preset CSS file + cover under `AppearanceSettings/` and a `decorative(...)` row here.
- The Dark base theme has no `css`/`cover`; appearance is driven by `appearance: 'dark'`. Keep `builtin: true` on every entry so they are treated as non-deletable.
- `BUILTIN_THEME_IDS` is derived from `BUILTIN_THEMES`; never maintain it by hand.

## Dependencies

### Internal

- `@/common/theme/types`, `@/common/theme/constants` (Theme type, base theme IDs)
- `@renderer/pages/settings/AppearanceSettings/themeCovers` (cover images)
- `@renderer/pages/settings/AppearanceSettings/presets/*.css` (raw preset CSS)

<!-- MANUAL: notes below this line are preserved on regeneration -->
