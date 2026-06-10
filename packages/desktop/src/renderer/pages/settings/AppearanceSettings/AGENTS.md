<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# AppearanceSettings

## Purpose
Renderer settings page for app appearance and theming. Hosts the appearance modal content (light/dark mode, color tokens) and the CSS skin-theme system that lets users create, edit, preview, and apply custom CSS themes — including injecting a user-uploaded background image into theme CSS.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | Page entry: wraps `AppearanceModalContent` in `SettingsPageWrapper`. |
| `CssThemeSettings.tsx` | Main CSS-theme management UI: lists builtin + custom themes, generates fallback preview palettes, applies/edits/deletes themes via `configService`/`ipcBridge`. Default export `CssThemeSettings`. |
| `CssThemeModal.tsx` | Arco modal (CodeMirror CSS editor) for adding/editing a CSS theme: name, cover upload, light/dark appearance, raw CSS. Cover upload is read via IPC and injected as a background block. |
| `backgroundUtils.ts` | Pure helpers to inject/replace a delimited background-image CSS block (`injectBackgroundCssBlock`, `BACKGROUND_BLOCK_START/END`) using precompiled regex. |
| `themeCovers.ts` | Static imports of preset theme cover PNGs (Vite-hashed asset URLs), re-exported by name. |
| `presets.ts` | Barrel re-exporting `BUILTIN_THEMES` and `DEFAULT_THEME_ID` from the theme module. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `presets` | Builtin CSS theme preset definitions and their assets (see `presets/AGENTS.md`). |

## For AI Agents
- Renderer-only code: NO Node.js APIs. File reads (cover upload → base64) go through `ipcBridge` (`dialog.showOpen`, `fs.getImageBase64`); never use `fs` directly.
- All user-facing strings use `useTranslation()` i18n keys under `settings.cssTheme.*` / `common.*` — do not hardcode.
- UI uses `@arco-design/web-react` + `@icon-park/react` + UnoCSS classes; colors reference CSS variables (`var(--color-*)`, `var(--fill-*)`) not literals.
- The background CSS block is delimited by the `BACKGROUND_BLOCK_START/END` markers; when editing background logic, reuse `injectBackgroundCssBlock` so the old block is stripped before re-inserting (regex is global — `lastIndex` reset matters).
- CSS editing uses `@uiw/react-codemirror` with the `css` language extension and the active color theme from `ThemeContext`.

## Dependencies
### Internal
`@/common` (ipcBridge), `@/common/config/configService`, `@/common/theme/*`, `@renderer/theme/builtinThemes`, `@renderer/hooks/context/ThemeContext`, `@renderer/components/base/AionModal`, `@renderer/components/settings/SettingsModal/contents/AppearanceModalContent`, `@renderer/utils/platform`, `@renderer/assets/themes/*`, `../components/SettingsPageWrapper`
### External
`react`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`, `@uiw/react-codemirror`, `@codemirror/lang-css`

<!-- MANUAL: notes below this line are preserved on regeneration -->
