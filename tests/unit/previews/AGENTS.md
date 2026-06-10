<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# previews

## Purpose
Unit tests for the conversation Preview feature under `packages/desktop/src/renderer/pages/conversation/Preview/` — document/file viewers, preview context state, the preview panel UI, and preview-history hooks/integration. Mix of jsdom DOM render tests and module-shape smoke tests.

## Key Files
| File | Description |
| --- | --- |
| `fileUtils.test.ts` | `fileUtils` (getFileExtension, getContentTypeByExtension, isImageFile/isTextFile/isOfficeFile, FILE_EXTENSION_MAP) and `previewUrls.buildPdfSrc`. |
| `ExcelViewer.dom.test.tsx` | `ExcelViewer` forwards props to a mocked `OfficeWatchViewer` with `docType='excel'`. |
| `OfficeDocViewer.dom.test.tsx` | `OfficeDocViewer` renders mocked `OfficeWatchViewer` with `docType='word'`, forwards `file_path`. |
| `PptViewer.dom.test.tsx` | `PptViewer` renders mocked `OfficeWatchViewer` with `docType='ppt'`, forwards `file_path`. |
| `OfficeWatchViewer.dom.test.tsx` | Module-shape only smoke test (default export type, `OFFICECLI_INSTALL_URL`); render deferred to e2e due to watch-poll timer hangs under jsdom. |
| `HTMLViewer.dom.test.tsx` | `HTMLViewer` renders iframe, honors `hideToolbar`, accepts `file_path`; mocks Monaco, Arco Message, i18n. |
| `MarkdownViewer.dom.test.tsx` | `MarkdownViewer` preview vs source (`viewMode`) modes, `hideToolbar`; mocks many renderer hooks/components. |
| `PreviewContext.dom.test.tsx` | `PreviewProvider` / `usePreviewContext` state: openPreview/closePreview, tabs, updateContent dirty flag; mocks ipcBridge/emitter/i18n. |
| `PreviewPanel.dom.test.tsx` | `PreviewPanel` module-import smoke test with extended import timeout; stubs `fetch` and `window.__backendPort`. |
| `PreviewHistoryDropdown.dom.test.tsx` | `PreviewHistoryDropdown` module-shape smoke test (default export is a function, imports without throwing). |
| `usePreviewHistory.dom.test.ts` | `usePreviewHistory` hook module-shape smoke test; functional behavior deferred to e2e (debounced save timers hang). |
| `previewHistoryIntegration.test.ts` | Preview-history HTTP routes via `createMockHttpBridge` (GET list, POST save, reset). |

## For AI Agents
- Two test styles: full jsdom render (`render`/`renderHook` from `@testing-library/react`) and lightweight module-shape smoke tests (`await import(...)`, assert `typeof default === 'function'`).
- Several viewers/hooks intentionally skip render coverage because long-lived `useEffect` timers (watch polling, debounced saves) hang the vitest worker-fork pool — see in-file design notes. Honor this; do not convert smoke tests to full renders.
- Heavy mocking via `vi.mock`: stub `OfficeWatchViewer`, `ipcBridge` (`@/common`), Monaco, Arco, `react-i18next` (t returns the key), and renderer hooks. `i18n` keys assert against raw key strings.
- HTTP integration uses the shared helper `tests/unit/_helpers/mockHttpBridge.ts` (`createMockHttpBridge`, `.onGet/.onPost/.asModule()/.reset()`).
- Run a single file: `bun run test tests/unit/previews/<file>`.

## Dependencies
### Internal
Source under test: `packages/desktop/src/renderer/pages/conversation/Preview/` (fileUtils, previewUrls, components/viewers, components/PreviewPanel, context, hooks). Shared helper: `tests/unit/_helpers/mockHttpBridge`.
### External
vitest, @testing-library/react, react, jsdom (DOM env).

<!-- MANUAL: notes below this line are preserved on regeneration -->
