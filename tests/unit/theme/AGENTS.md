<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# theme

## Purpose

Unit tests for the theming system: theme resolution, config migration, DOM application of theme attributes/CSS, and CSS-source assertions that guard Arco overlay (tooltip/popover/popconfirm) styling. Targets `@/common/theme/*`, `@/renderer/utils/theme/*`, and renderer style/preset files.

## Key Files

| File                           | Description                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveTheme.test.ts`         | `resolveActiveTheme` — lookup by id, user-theme lookup, fallback to Light on unknown/empty id, fallback to first theme when no Light present.                                                                               |
| `migrateThemeConfig.test.ts`   | `migrateThemeConfig` — maps legacy `css.activeThemeId` (default-theme → Light, preset id passthrough), dark-toggle fallback, wraps legacy `css.themes` as css-only user themes.                                             |
| `applyTheme.dom.test.ts`       | `applyTheme` (DOM) — sets `data-theme` / `arco-theme` attributes, injects/removes `theme-decoration` CSS, writes `theme-tokens` `:root` block.                                                                              |
| `tooltipOverlayStyles.test.ts` | Reads `arco-override.css` and preset `.css` files as text, asserting shared `--aion-overlay-*` tokens, overlay selector coverage, dark-mode override specificity, and that presets do not re-skin tooltip/popover surfaces. |

## For AI Agents

- Vitest 4, no test runner config beyond project default. Run with `bun run test`.
- `applyTheme.dom.test.ts` relies on jsdom; `beforeEach` resets `documentElement`/`body` attributes and removes injected `theme-tokens`/`theme-decoration` style elements. Uses a shared `base` spread (`builtin/created_at/updated_at`) plus `as Theme` casts.
- `resolveTheme.test.ts` builds themes via a local `mk()` factory; constants come from `@/common/theme/constants` (`LIGHT_THEME_ID`, `DARK_THEME_ID`).
- `tooltipOverlayStyles.test.ts` is a source-content guard: it `fs.readFileSync`s CSS via `path.resolve(process.cwd(), ...)` and uses `toContain` / `not.toContain` substring assertions — update expected strings when the CSS or preset list changes.

## Dependencies

### Internal

`packages/desktop/src/common/theme/` (resolveTheme, migrateThemeConfig, constants, types), `packages/desktop/src/renderer/utils/theme/` (applyTheme), `packages/desktop/src/renderer/styles/arco-override.css`, `packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets/`.

### External

vitest; node `fs` / `path`; jsdom (via Vitest DOM env) for `applyTheme.dom.test.ts`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
