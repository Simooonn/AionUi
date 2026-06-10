<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# theme

## Purpose
Shared, process-agnostic theme model for AionUi: the `Theme` type, light/dark ID constants, pure active-theme resolution, and a one-time migration from the legacy `css.*` config shape to the current `theme.*` shape. Used by both main and renderer since it lives under `common`.

## Key Files
| File | Description |
| --- | --- |
| `types.ts` | `Theme` type (`id`, `name`, `appearance`, optional `tokens`/`css`/`cover`, `builtin`, timestamps) and `ThemeAppearance` (`'light' \| 'dark'`). `appearance` drives `data-theme`/`arco-theme`; `css` is the escape hatch, `tokens` an optional `:root` variable channel. |
| `constants.ts` | Exports `LIGHT_THEME_ID = 'light'` and `DARK_THEME_ID = 'dark'`. |
| `resolveTheme.ts` | `resolveActiveTheme(activeId, themes)` — pure lookup by id, falling back to the Light theme, then to the first theme in the list. |
| `migrateThemeConfig.ts` | `migrateThemeConfig(old)` converts old config (`theme`, `css.activeThemeId`, `css.themes`, `customCss`) into `{ 'theme.activeId', 'theme.userThemes' }`. Maps `theme: 'dark'` to dark appearance, drops preset themes (`is_preset`), and replaces the legacy `default-theme` id with the appearance-matched builtin id. |

## For AI Agents
- All code here is pure/data-only — no DOM, no Node, no IPC — so it stays safe to import from either process.
- `resolveActiveTheme` expects the caller to pass the full list (builtins + user themes); it does not source builtins itself.
- Migration intentionally discards preset themes and `customCss` is unused in the new shape — preserve that behavior unless the config schema changes.
- Builtin theme ids are exactly the `LIGHT_THEME_ID`/`DARK_THEME_ID` constants; reuse them rather than hardcoding `'light'`/`'dark'`.

## Dependencies
### Internal
Self-contained within this directory (`types`, `constants` cross-imported); no other repo modules.

<!-- MANUAL: notes below this line are preserved on regeneration -->
