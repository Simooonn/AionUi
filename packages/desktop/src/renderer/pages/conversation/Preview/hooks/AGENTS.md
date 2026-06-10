<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose
Renderer-side React hooks backing the conversation Preview panel: file history/snapshots over IPC, theme detection, tab overflow indicators, editor↔preview scroll synchronization, and the Cmd/Ctrl+S save shortcut.

## Key Files
| File | Description |
| --- | --- |
| `usePreviewHistory.ts` | Loads/saves/selects preview snapshots via `ipcBridge.previewHistory` (list/save/getContent). Builds a `PreviewHistoryTarget` from `activeTab.metadata`, debounces saves with `SNAPSHOT_DEBOUNCE_TIME`, surfaces results through an Arco `Message` API + context holder, and i18n-localizes all errors. |
| `useScrollSync.ts` | Split-screen scroll sync between editor and preview containers. Computes scroll percentage, writes it to the peer's `data-target-scroll-percent` dataset attr + sets `scrollTop`, and guards re-entrancy with an `isSyncingRef` unlocked via `requestAnimationFrame` (falls back to `setTimeout`/`SCROLL_SYNC_DEBOUNCE`). |
| `useScrollSyncHelpers.ts` | Companion scroll hooks: `useScrollSyncTarget` (MutationObserver on the dataset attr), `useCodeMirrorScroll` (binds to `.cm-scroller`, returns `setScrollPercent`), `useContainerScroll`, `useContainerScrollTarget`. |
| `useTabOverflow.ts` | Detects horizontal tab overflow and returns `tabsContainerRef` + `tabFadeState` (left/right gradient flags). Recomputes on scroll, window resize, and `ResizeObserver`; threshold via `TAB_OVERFLOW_THRESHOLD`. |
| `useThemeDetection.ts` | Returns `'light'｜'dark'` by reading `data-theme` on `<html>` and observing changes with a MutationObserver. |
| `usePreviewKeyboardShortcuts.ts` | Window `keydown` listener for Cmd/Ctrl+S; `preventDefault`s the browser save and calls `onSave` only when `isDirty`. |
| `index.ts` | Barrel re-exporting all six hooks. |

## For AI Agents
- Renderer process only: these hooks use DOM APIs (`document`, `window`, `MutationObserver`, `ResizeObserver`, `.cm-scroller` queries) freely; never import Node.js APIs here.
- Constants (`SNAPSHOT_DEBOUNCE_TIME`, `SCROLL_SYNC_DEBOUNCE`, `TAB_OVERFLOW_THRESHOLD`) live in `../constants` — reuse them, don't hardcode timings/thresholds.
- Cross-process access goes through `ipcBridge` from `@/common`; preview-history calls take a `PreviewHistoryTarget` built from `activeTab.metadata` (file_path/workspace/file_name/title/language).
- All user-facing strings use `useTranslation()` i18n keys (`preview.*`, `common.unknownError`) — no hardcoded text.
- Scroll sync is bidirectional and re-entrancy-sensitive: preserve the `isSyncingRef` lock + scheduled unlock and the `data-target-scroll-percent` contract when editing `useScrollSync.ts`/`useScrollSyncHelpers.ts`.
- `usePreviewHistory` returns a `messageContextHolder` that the consuming component must render for Arco messages to appear.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/types/office/preview` (`PreviewHistoryTarget`, `PreviewSnapshotInfo`, `PreviewContentType`)
- `../constants`

### External
- `react`, `react-i18next`, `@arco-design/web-react` (`Message`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
