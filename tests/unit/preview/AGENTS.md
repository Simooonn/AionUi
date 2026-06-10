<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# preview

## Purpose
Vitest unit tests for the renderer's conversation Preview feature (`@/renderer/pages/conversation/Preview`). Covers the CodeMirror-based code editor, its theme/config helpers, the markdown/mermaid/shiki theme mappers, the language loader, and preview toolbar logic.

## Key Files
| File | Description |
| --- | --- |
| `codeEditor.dom.test.tsx` | DOM-rendering test of `CodeEditor` component; mocks `ThemeContext` and `react-i18next`, asserts the `.cm-editor` mounts, renders the value, and shows the `preview.aiWriting` badge when content grows externally. |
| `codeEditorConfig.test.ts` | Verifies `DEFAULT_CODE_EDITOR_CONFIG` defaults (mono font, 13px, lineHeight 1.5, tabSize 2, wrap) and that `getCodeEditorConfig()` returns them. |
| `codeEditorTheme.test.ts` | Checks `codeEditorFontTheme()` produces a truthy extension and `getCodeEditorBaseTheme()` maps `'dark'`/`'light'` to matching identifiers. |
| `languageLoader.test.ts` | Tests `matchLanguageDescription` (by language name, by file extension, null fallback) and `shouldDisableHighlighting` threshold at 30k chars. |
| `markdownTheme.test.ts` | Asserts `getMarkdownShikiThemes()` returns the fixed `[github-light, github-dark]` pair and `getMermaidTheme()` maps mode to `dark`/`default`. |
| `previewToolbarUtils.test.ts` | Tests `shouldShowDownload(contentType, hasFilePath)` — hides download for on-disk code/markdown, shows it for synthetic content and other types. |

## For AI Agents
- These are renderer-facing tests but run under Vitest/jsdom — pure-logic helpers (`theme/`, `previewToolbarUtils`) are imported directly; only `codeEditor.dom.test.tsx` renders via `@testing-library/react`.
- The DOM test must mock `ThemeContext` and `react-i18next` before importing `CodeEditor`; the i18n mock returns the key verbatim, so assertions check for raw keys like `preview.aiWriting`.
- Import aliases are mixed across files: both `@/renderer/...` and `@renderer/...` appear — match the alias already used when adding cases.
- When a Preview helper's contract changes (config defaults, the shiki theme pair order, the 30k highlight threshold), these tests assert exact literal values and will need updating in lockstep.

## Dependencies
### Internal
- `@/renderer/pages/conversation/Preview/components/editors/CodeEditor`
- `@/renderer/pages/conversation/Preview/theme/{codeEditorConfig,codeEditorTheme,languageLoader,markdownTheme}`
- `@renderer/pages/conversation/Preview/components/PreviewPanel/previewToolbarUtils`
- `@/renderer/hooks/context/ThemeContext` (mocked)
### External
- `vitest`, `@testing-library/react`, `react`, `react-i18next` (mocked)

<!-- MANUAL: notes below this line are preserved on regeneration -->
