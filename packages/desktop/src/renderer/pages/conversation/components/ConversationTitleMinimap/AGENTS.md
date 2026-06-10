<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ConversationTitleMinimap

## Purpose
A renderer-side overlay panel that summarizes a conversation into a searchable list of Q/A turns. Triggered from the conversation title bar (or Cmd/Ctrl+F in the desktop runtime), it lets the user filter turns by keyword/index and jump the chat scroll position to a chosen message.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | Default export `ConversationTitleMinimap` React component. Renders the search trigger button and a `createPortal` floating panel (loading/empty/no-match/list states) with highlighted snippets and selectable turn rows. Props: `conversation_id`, `hideTrigger`. |
| `useMinimapPanel.ts` | Hook holding all state and side effects: fetches messages via `ipcBridge.database.getConversationMessages`, builds turn previews, manages search mode, panel position/visual style, click-outside/Escape close, Cmd/Ctrl+F shortcut (desktop only), arrow/Enter result navigation, and IME composition handling. |
| `minimapUtils.ts` | Pure helpers: `buildTurnPreview` (pairs `right`/`left` text messages into turns), snippet truncation/highlighting, regex escaping, Arabic↔Chinese index search tokens, and DOM-probe color readers (`readPopoverVisualStyle`, `readChatSurfaceBackground`, `getPanelWidth`). |
| `minimapTypes.ts` | `TurnPreviewItem` / `MinimapVisualStyle` / props types, layout constants (panel width/height/margins, `HEADER_HEIGHT`, item row estimates), and `defaultVisualStyle`. |
| `ConversationTitleMinimap.module.css` | CSS Module for the header shell, section divider, and Arco `Input` search box overrides (via `:global(.arco-input-*)`). |

## For AI Agents
- Renderer-only code — NO Node.js APIs. Data comes solely through `ipcBridge`; DOM measurement (`getComputedStyle`, `querySelector`) guards on `typeof document/window !== 'undefined'`.
- The panel is portaled to `document.body` at `position: fixed`; positioning is recomputed on resize/scroll and centered against `.chat-layout-header`. If you change those selectors here, keep them in sync with the actual header markup.
- Visual style is sampled at runtime from a hidden `.arco-popover-content` probe and a `MutationObserver` on `data-theme`/`class`, instead of hardcoded colors — preserve this so theming stays correct.
- The Cmd/Ctrl+F shortcut intentionally only intercepts when `window.electronAPI` exists, leaving native find intact in WebUI. IME composition refs (`isSearchInputComposingRef`, `pendingCloseAfterCompositionRef`) prevent premature close mid-input — do not bypass them.
- `index.tsx` uses a raw `<button>` for list rows (keyboard/data-attr navigation target); this is an intentional exception to the Arco-only rule. User-facing strings use i18n keys under `conversation.minimap.*`.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/chat/chatLib` (`TMessage`, `IMessageText`), `@/renderer/utils/chat/chatMinimapEvents` (`dispatchChatMessageJump`)
### External
- `@arco-design/web-react` (`Input`, `Empty`, `Spin`, `IconSearch`), `react` / `react-dom` (`createPortal`), `react-i18next`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
