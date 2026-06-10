<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Preview

## Purpose
Self-contained, reusable document-preview module for the conversation UI. Renders Markdown, HTML, code, diffs, images, PDFs, Office docs (Word/Excel/PPT), and web URLs in a split panel, with editing support for text formats. `index.ts` is the single public entry point that re-exports context, hooks, components, types, constants, and utils.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Barrel re-exporting `./context`, `./types`, `./hooks`, `./components`, `./constants`, `./fileUtils`. The documented module API. |
| `constants.ts` | Tunable constants: debounce times (snapshot 1000ms, scroll-sync 100ms), tab overflow/fade dimensions, split-panel ratios/limits, large-text thresholds (`LARGE_TEXT_PREVIEW_THRESHOLD`, `LARGE_TEXT_VIEWER_THRESHOLD`), and `FILE_TYPES_WITH_BUILTIN_OPEN` / `EDITABLE_CONTENT_TYPES` lists. |
| `fileUtils.ts` | Extension→content-type mapping (`FILE_EXTENSION_MAP`) plus `getFileExtension`, `getContentTypeByExtension` (defaults to `code`), and predicates `isImageFile` / `isTextFile` / `isOfficeFile`. |
| `types.ts` | Re-exports core IPC preview types from `@/common/types/office/preview`; defines local `ViewMode` (`'source' \| 'preview'`) and `PreviewTabInfo`. |
| `previewUrls.ts` | `buildPdfSrc` — converts a file path to a `file://` URL or falls back to inline content. |
| `README.cn.md` / `README.en.md` | Module documentation (Chinese / English). |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `components` | React UI: preview panel, tabs, and per-format viewers/editors (see `components/AGENTS.md`). |
| `context` | `PreviewProvider` / `usePreviewContext` state container (see `context/AGENTS.md`). |
| `hooks` | Preview hooks (e.g. history/snapshot logic) (see `hooks/AGENTS.md`). |
| `theme` | Theming for the preview surface (see `theme/AGENTS.md`). |

## For AI Agents
- Renderer-only code — NO Node.js APIs. File access (e.g. `buildPdfSrc`'s `file://` URLs) is consumed by the embedded viewer, not `fs`.
- Cross-process types live in `@/common/types/office/preview`; `types.ts` only re-exports them and adds renderer-local types. Do not duplicate the `PreviewContentType` union here.
- `getContentTypeByExtension` falls back to `code` for unknown/missing extensions; `code` and `url` have empty extension lists in `FILE_EXTENSION_MAP` by design.
- The editable/openable/large-text behaviors are driven by the constant lists and thresholds in `constants.ts` — change behavior there rather than hardcoding values in components.
- Bilingual comments (Chinese + English) are the convention in this directory; match it when editing.

## Dependencies
### Internal
- `@/common/types/office/preview` (shared IPC preview types)
### External
- None directly in these top-level files (React/Arco usage lives in `components/`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
