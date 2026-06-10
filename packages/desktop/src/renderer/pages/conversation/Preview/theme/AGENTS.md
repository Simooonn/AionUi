<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# theme

## Purpose
Theme and language-loading helpers for the Preview feature's source editor (CodeMirror) and markdown renderer (Streamdown/Shiki/Mermaid). Centralizes font config, light/dark editor surface colors, syntax highlight styles, and lazy language resolution so every Preview editor matches the active app theme.

## Key Files
| File | Description |
| --- | --- |
| `codeEditorConfig.ts` | Single source of truth for editor font/size/lineHeight/tabSize/wrap. Exports `DEFAULT_CODE_EDITOR_CONFIG`, `getCodeEditorConfig()`, and the `CodeEditorConfig` type. Values reference CSS vars (`--font-mono`, `--code-font-size`). |
| `codeEditorTheme.ts` | Builds CodeMirror `Extension`s: `codeEditorFontTheme()` (font from config), `codeEditorSurfaceTheme()` (backgrounds via `--bg-1`/`--bg-2`/`--border-light` — wrap in `Prec.highest` at call site), and `getCodeEditorBaseTheme(mode)`. Exports `EditorThemeMode`. |
| `languageLoader.ts` | `matchLanguageDescription()` (by name then filename), `loadLanguageSupport()` (lazy, never throws → null on failure), and `shouldDisableHighlighting(length)` guard against `LARGE_TEXT_VIEWER_THRESHOLD`. |
| `markdownHighlightStyle.ts` | GitHub-flavored markdown `HighlightStyle` pair (LIGHT/DARK) via `getMarkdownHighlightStyle(mode)`. Colors markdown tokens the CodeMirror default barely styles; fenced code intentionally not colorized. |
| `markdownTheme.ts` | `getMarkdownShikiThemes()` returns the `[github-light, github-dark]` Shiki pair for Streamdown code blocks; `getMermaidTheme(mode)` maps mode to Mermaid `default`/`dark`. |

## For AI Agents
- Renderer-only code — no Node.js APIs.
- All surface/background colors must use semantic CSS tokens (`var(--bg-1)` etc.), never hardcoded values. Syntax-highlight hex colors live in `markdownHighlightStyle.ts` and are paired explicitly per light/dark mode.
- `codeEditorTheme.ts` and `markdownTheme.ts` document themselves as the "seam" for future custom color schemes — extend the mode→theme mapping here rather than scattering theme logic into editor components.
- `index.ts` is a pure barrel (`export *`); import from `./theme` rather than individual files.

## Dependencies
### Internal
- `../constants` (`LARGE_TEXT_VIEWER_THRESHOLD`)
### External
- `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/language-data`, `@lezer/highlight`, `streamdown`, `react` (types)

<!-- MANUAL: notes below this line are preserved on regeneration -->
