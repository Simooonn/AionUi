<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ui

## Purpose
Renderer-only React hooks for UI behavior in the desktop app: keyboard shortcuts, font scaling/sizing, resizable split panels, text selection, element ref collection, and timing utilities (debounce/throttle/latest-ref). Each file exports a single focused hook.

## Key Files
| File | Description |
| --- | --- |
| `useConversationShortcuts.ts` | Global keydown listener (Electron desktop only) for Ctrl+Tab / Ctrl+Shift+Tab to cycle visible conversations and Cmd/Ctrl+T to open `/guid`; navigates via react-router. |
| `useFontScale.ts` | Reads/writes Electron zoom factor through `ipcBridge.application.get/setZoomFactor`; clamps to 0.8–1.3. Exports `FONT_SCALE_*` constants and `clampFontScale`. |
| `useFontSizes.ts` | Loads persisted per-key font sizes from `configService`, applies them to CSS vars via `applyFontSizes`, and subscribes for same-window reactivity. Applies sizes at module load to reduce FOUC. |
| `useResizableSplit.tsx` | Pointer-drag split-panel hook; supports `ratio`/`px` units, localStorage persistence, RAF-batched updates, and emits a `preview-panel-resize` CustomEvent. Returns `splitRatio`, `setSplitRatio`, and `dragHandle`/`createDragHandle` JSX renderers. |
| `useTextSelection.ts` | Tracks text selection inside a container ref; positions a toolbar at the mouse `clientX/Y` on mouseup. Returns `selectedText`, `selectionPosition`, `clearSelection`. |
| `useLatestRef.ts` | `useLatestRef` (latest value ref via useLayoutEffect) and `useLatestCallback` (stable function reference that calls the latest fn) to avoid stale-closure traps. |
| `useIndexedItemRefs.ts` | Collects child node refs into an indexed array; returns `itemRefs` and an index-keyed `setItemRef` callback factory. |
| `useDebounce.ts` | Debounced callback with auto-cleanup of the timer on unmount. |
| `useThrottle.ts` | Throttled callback with leading-edge execution plus trailing timeout. |

## For AI Agents
- Renderer process: NO Node.js APIs. These hooks use browser/DOM APIs (`window`, `document`, `localStorage`, `getSelection`, pointer events) freely.
- Cross-process state goes through `ipcBridge` (`useFontScale`) or `configService` (`useFontSizes`) — do not reach into the main process directly.
- Hooks guard against SSR/non-window environments with `typeof window === 'undefined'` checks (see `useResizableSplit`, `useFontSizes`); preserve these.
- Comments are bilingual (Chinese + English) in most files; match the existing style. Note `useDebounce`/`useThrottle`/`useLatestCallback` use `any[]` in generic constraints despite the project's no-`any` rule.
- `useConversationShortcuts` is gated by `isElectronDesktop()` and checks `event.isComposing`/`defaultPrevented` before acting — keep those guards when extending shortcuts.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/config/configService`, `@/common/config/fontSizes`
- `@renderer/utils/theme/applyFontSizes`, `@/renderer/utils/common` (`removeStack`), `@/renderer/utils/platform` (`isElectronDesktop`)
- `@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds`
### External
- `react`, `react-router-dom`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
