<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# renderers

## Purpose
Special-purpose preview renderers for the conversation Preview pane. Currently centered on rich HTML rendering: `HTMLRenderer` displays generated HTML inside an Electron `<webview>` (or a browser `<iframe>` fallback), with an "inspect" mode for picking DOM elements and a floating toolbar for sending selected text back to the chat send box.

## Key Files
| File | Description |
| --- | --- |
| `HTMLRenderer.tsx` | Main renderer (`HTMLRendererProps`, exports `InspectedElement`). Picks Electron `<webview>` vs browser `<iframe>`; resolves/inlines relative `<link>`/`<script>`/`<img>` resources (`resolveRelativePath`); syncs scroll via `useScrollSyncTarget`; streams content with `useTypingAnimation`; tracks `data-theme` via `MutationObserver`; injects inspect script and forwards picked elements through `onElementSelected`. |
| `htmlInspectScript.ts` | `generateInspectScript(inspectMode, messages)` returns an injectable IIFE string. Highlights hovered elements via an overlay, and on click sends `__INSPECT_ELEMENT__{json}` over `console.log` (captured by the webview host); idempotent — removes prior styles/listeners on re-injection. |
| `SelectionToolbar.tsx` | Floating "Add to chat" toolbar (`@floating-ui/react`) positioned at a `SelectionPosition`. On `mousedown` calls `addToSendBox(selectedText)` from `PreviewContext`. |
| `index.ts` | Barrel re-exporting `HTMLRenderer` and `SelectionToolbar`. |

## For AI Agents
- Renderer process only — no Node.js APIs. File access goes through `ipcBridge` from `@/common`; do not touch `fs` directly.
- Electron vs browser branches differ: in Electron the `<webview>` can load directly from `file_path` when relative resources are detected; in the browser those resources are inlined into the HTML string. Keep both paths working when editing resource handling.
- The inspect script is a string of plain DOM JS executed inside the webview/iframe — it cannot use React or project imports. Communication is one-way via the `__INSPECT_ELEMENT__` console-log convention; preserve that prefix and JSON shape (`{ html, tag }`) if you change either side.
- `SelectionToolbar` uses `mousedown` (not `click`) deliberately, since the text selection may be cleared before a `click` fires. Don't switch it to `onClick`.
- User-facing strings use i18n (`useTranslation` / `t('preview.addToChat')`); inspect-mode notification messages are passed in from the host as `copySuccessMessage`.

## Dependencies
### Internal
- `@/common` (`ipcBridge`)
- `@/renderer/hooks/chat/useTypingAnimation`, `@/renderer/hooks/ui/useTextSelection` (`SelectionPosition` type)
- `../../context/PreviewContext` (`usePreviewContext` → `addToSendBox`)
- `../../hooks/useScrollSyncHelpers` (`useScrollSyncTarget`)

### External
- `react`, `react-i18next`
- `@floating-ui/react` (`useFloating`, `offset`, `flip`, `shift`, `autoUpdate`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
