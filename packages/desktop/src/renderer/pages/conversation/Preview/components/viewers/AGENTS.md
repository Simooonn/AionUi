<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# viewers

## Purpose
Read-only preview components for the conversation Preview panel, one per file type (diff, markdown, HTML, PDF, image, URL, and Office docs). Each takes `content`/`file_path`/`workspace` props and renders the file inside the preview pane. Exported as a barrel from `index.ts`.

## Key Files
| File | Description |
| --- | --- |
| `DiffViewer.tsx` | Renders diffs with `diff2html` (line-by-line / side-by-side) plus a raw `source` mode via `react-syntax-highlighter`; injects a side-by-side toggle into the d2h header via a React portal. Default export `DiffPreview`. |
| `MarkdownViewer.tsx` | Renders Markdown with `streamdown` (KaTeX math, Mermaid, Shiki themes); resolves relative/local image paths through IPC with an in-component cache; supports source editing via `MarkdownEditor` and scroll-sync. |
| `HTMLViewer.tsx` | Live HTML preview in an `iframe` with Monaco-based code editing and a DevTools-style element inspector for two-way preview↔code locating. |
| `PDFViewer.tsx` | Displays a PDF in an Electron `<webview>` (src built by `buildPdfSrc`); offers "open in system" via `ipcBridge.shell.openFile` and can mount its toolbar through `PreviewToolbarExtrasContext`. |
| `ImageViewer.tsx` | Shows an image; loads bytes as base64 via `ipcBridge.fs.getImageBase64` when only a `file_path` is given, with loading/error states. Uses Arco `Image` with zoom preview. |
| `URLViewer.tsx` | Thin wrapper over shared `WebviewHost` to preview a web page with a navigation bar. |
| `OfficeWatchViewer.tsx` | Shared engine for ppt/word/excel: routes through per-type IPC bridges (`pptPreview`/`wordPreview`/`excelPreview`), renders in `WebviewHost`/iframe, and maps OfficeCLI error codes (e.g. `OFFICECLI_NOT_FOUND`) to i18n install hints. |
| `ExcelViewer.tsx` / `OfficeDocViewer.tsx` / `PptViewer.tsx` | One-line wrappers passing `docType='excel' \| 'word' \| 'ppt'` to `OfficeWatchViewer`. |

## For AI Agents
- Renderer-only — no Node.js APIs. Filesystem/shell/Office access goes through `ipcBridge` (`@/common`), never direct fs.
- Theme is read from `document.documentElement[data-theme]` and tracked with a `MutationObserver` (DiffViewer/HTMLViewer); reuse that pattern instead of inventing a new theme source.
- New Office formats should extend `OfficeWatchViewer` (add a `BRIDGE`/`PROXY_PATH`/`I18N_KEYS` entry) rather than build a standalone viewer; the three Office wrappers are intentionally trivial.
- All user-facing text uses `useTranslation` keys under the `preview.*` / `common.*` namespaces — do not hardcode strings.
- When adding a viewer, also export it from `index.ts`.

## Dependencies
### Internal
`@/common` (ipcBridge, httpBridge), `@/renderer/components/media/WebviewHost`, `@/renderer/hooks/ui/useTextSelection`, sibling `../renderers/SelectionToolbar`, `../editors/MarkdownEditor`, Preview-level `../../context/*`, `../../previewUrls`, `../../theme`, `../../hooks`.
### External
`diff2html`, `react-syntax-highlighter`, `streamdown`, `katex`, `@monaco-editor/react`, `@arco-design/web-react`, `react-i18next`, `classnames`, `react-dom`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
