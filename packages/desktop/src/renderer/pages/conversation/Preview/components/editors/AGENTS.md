<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# editors

## Purpose

CodeMirror 6-based editable text editors used by the Preview pane to edit files in place. Three flavors specialized by content type: generic code, HTML, and Markdown. Each is a controlled `<CodeMirror>` wrapper that follows the app theme, supports scroll-sync with the preview container, and reports edits via `onChange`.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodeEditor.tsx`     | Unified always-editable editor. Dynamically loads language support via `loadLanguageSupport(language, fileName)`, disables highlighting/fold for large files (`shouldDisableHighlighting`), and distinguishes external streaming growth from user edits to show an "AI writing" badge (`preview.aiWriting`) + auto-scroll. Wrapped in `React.memo`. |
| `HTMLEditor.tsx`     | HTML editor (`@codemirror/lang-html`) with explicit undo/redo history (`history()` + `historyKeymap`, `basicSetup.history: false`). Uses `file_path` as the `key` to keep the instance stable across file switches; guards non-string `onChange` values.                                                                                            |
| `MarkdownEditor.tsx` | Markdown editor (`@codemirror/lang-markdown`) layering a custom highlight style from `getMarkdownHighlightStyle` over basicSetup's default highlighter; mono font, 13px.                                                                                                                                                                            |
| `index.ts`           | Barrel re-exporting `MarkdownEditor`, `HTMLEditor`, `CodeEditor` as named exports.                                                                                                                                                                                                                                                                  |

## For AI Agents

- Renderer-only React components — no Node.js APIs.
- Theme: read `useThemeContext()` and pass `theme === 'dark' ? 'dark' : 'light'`. Surface background must follow theme tokens via `Prec.highest(codeEditorSurfaceTheme())` in the extensions array — keep this present in every editor here.
- These are controlled components: the parent must echo `value` 1:1 synchronously after `onChange`. `CodeEditor`'s streaming-vs-user-edit detection (`userEditRef`, `prevLenRef`) relies on this; breaking it produces false "AI writing" badges.
- Scroll sync goes through `useCodeMirrorScroll` / `useScrollSyncTarget` (from `../../hooks/useScrollSyncHelpers`) in HTML/Markdown editors; `CodeEditor` instead attaches a raw `scroll` listener on `containerRef`.
- User-facing strings must use i18n (`useTranslation`) — see the `preview.aiWriting` key in `CodeEditor`.

## Dependencies

### Internal

- `@/renderer/hooks/context/ThemeContext`
- `../../theme/` (`codeEditorConfig`, `codeEditorTheme`, `languageLoader`, `markdownHighlightStyle`)
- `../../hooks/useScrollSyncHelpers`

### External

- `@uiw/react-codemirror`, `@codemirror/*` (`state`, `view`, `commands`, `search`, `language`, `lang-html`, `lang-markdown`)
- `react`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
