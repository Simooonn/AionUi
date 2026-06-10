<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# styles

## Purpose
Global, app-wide stylesheets and color tokens for the renderer: Arco Design overrides, layout/sidebar rules, shared Markdown styles, and the TypeScript color-token API. This is the only place global CSS lives (component-scoped styles use CSS Modules elsewhere).

## Key Files
| File | Description |
| --- | --- |
| `colors.ts` | TS color-system helpers: `cssVars` (map of semantic CSS var names: aou/bg/text/primary/gray etc.), `getCSSVar()`, `cssVar(property, varName)`, `iconColors`, `diffColors` (addition/deletion/hunk hex + bg), and `colorMapping` (legacy hex → `var(--color-*)` for migration). |
| `arco-override.css` | Non-theme Arco overrides: defines `--font-mono`, `--code-font-size`, `--aion-overlay-*` tokens (light + `[data-theme='dark']`); forces system font over Arco's bundled Inter; restyles tooltip/popover/popconfirm surfaces. |
| `layout.css` | Layout-level rules scoped to class names (`.sider-section-label`, `.sider-action-btn`, `.layout-sider`, section titles, message positioning). Uses opaque `--bg-*` tokens and explicit dark-mode `[data-theme='dark']` selectors. |
| `markdown.css` | Shared Markdown content styles scoped under `.aionui-markdown`; mirrors chat ShadowView markdown for consistency, semantic vars only (`--text-primary`, `--md-font-size`). |
| `MIGRATION.md` | Migration guide (Chinese) mapping hardcoded hex values to UnoCSS classes (`bg-base`, `text-t-primary`) and CSS vars; reference for replacing legacy inline colors. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `themes` | Theme CSS layer: `base.css`, `default-color-scheme.css` (light/dark `--color-*` variable definitions), `index.css` barrel, plus a `README.md`. |

## For AI Agents
- Renderer-only (browser context). `colors.ts` reads `document` / `getComputedStyle` — never import it from main/process code.
- Two parallel dark-mode selectors are used in these files: `html[data-theme='dark']` and `body[arco-theme='dark']`. When adding dark overrides, match the existing convention in the file you edit (`layout.css` uses `[data-theme='dark']`).
- Do NOT hardcode hex colors in CSS rules — use semantic `var(--color-*)` / `var(--bg-*)` / `var(--text-*)` tokens. The exceptions already present are `diffColors` in `colors.ts` and the `--aion-overlay-*` token definitions.
- `--font-mono` and other custom properties are intentionally inherited so Shadow DOM markdown can reference them; keep them defined on `:root`.
- These are global stylesheets — changes here affect the whole app. Prefer CSS Modules for component-scoped styling instead of expanding these files.

## Dependencies
### External
- Styles the `@arco-design/web-react` component classes (`.arco-tooltip-content`, `.arco-layout-sider-children`, etc.). Token names align with UnoCSS utilities defined in the repo `uno.config.ts`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
