<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# context

## Purpose

React context providers that back the conversation Preview panel. `PreviewContext` owns the multi-tab preview state (open/close, active tab, content editing, save, DOM snippet collection, localStorage persistence) and `PreviewToolbarExtrasContext` lets preview content inject custom toolbar slots.

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreviewContext.tsx`              | Main provider. Defines `PreviewProvider`/`usePreviewContext` plus types `PreviewContextValue`, `PreviewTab`, `PreviewMetadata`, `DomSnippet`, `OpenPreviewOptions`. Manages tabs (`openPreview`/`closeTab`/`switchTab`), in-tab edits with dirty tracking, `saveContent` via `ipcBridge.fs.writeFile`, DOM snippet management, and sendbox integration. Persists lightweight text tabs (`markdown`/`html`/`code`/`diff`, ≤80k chars) to `localStorage` with legacy-key migration. Subscribes to `emitter('preview.open')`, `ipcBridge.preview.open`, and `ipcBridge.fileStream.contentUpdate`. |
| `PreviewToolbarExtrasContext.tsx` | Lightweight context exposing `setExtras` so preview renderers can supply `left`/`right` toolbar nodes. `usePreviewToolbarExtras` returns `null` outside a provider.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `index.ts`                        | Barrel re-exporting both providers, hooks, and their public types.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## For AI Agents

- Renderer-only code: NO Node.js APIs. All filesystem/preview/file-stream work goes through `ipcBridge` (`@/common`), never direct `fs`.
- `usePreviewContext` throws if used outside `PreviewProvider`; `usePreviewToolbarExtras` returns `null` outside its provider — guard accordingly.
- `activeTabId` is mirrored in `activeTabIdRef` so `setTabs` updaters read the latest value without dependency churn — keep that pattern when adding state updaters.
- Persistence is selective: only `PERSISTABLE_CONTENT_TYPES` under `MAX_PERSISTED_TAB_CONTENT_LENGTH` are saved; `isOpen` is intentionally never restored. Update `sanitizeTabsForPersistence`/`parsePersistedTabs` together if changing the shape.
- Tab matching (`findPreviewTabInList`) prefers `file_path`, then `file_name` with path compatibility — preserve this priority to avoid same-named-file collisions.
- Comments are bilingual (Chinese + English) here; follow the existing style.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/common/types/office/preview` (`PreviewContentType`), `@/renderer/utils/emitter`

### External

- `react` (context, hooks)
