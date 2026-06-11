<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose

Renderer-side presentational and input components for the conversation/chat UI: the message input area (SendBox), inline pickers and menus (slash commands, @file, emoji), command-queue management, speech-to-text, and message-content display widgets (collapsible blocks, thinking/"thought" display).

## Key Files

| File                     | Description                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CollapsibleContent.tsx` | Wrapper that clamps tall children to `maxHeight` with a gradient/`mask-image` fade and an expand/collapse toggle; theme-aware (`useThemeContext`), supports `useMask` and `allowHorizontalScroll`.                |
| `CommandQueuePanel.tsx`  | Draggable, reorderable list of queued conversation commands (`@dnd-kit`); supports pause/resume, interaction lock, edit/update, reorder, remove and clear via callback props over `ConversationCommandQueueItem`. |
| `EmojiPicker.tsx`        | Arco `Popover`-based emoji picker with categorized emoji sets and a localStorage-backed "recent" category.                                                                                                        |
| `SlashCommandMenu.tsx`   | Generic keyboard-navigable dropdown (`activeIndex`, hover/select callbacks, loading/empty states) used to render slash-command suggestions; scrolls active item into view.                                        |
| `SpeechInputButton.tsx`  | Mic/stop/loader button driving `useSpeechInput`; reads `configService`, maps availability/error codes to i18n keys, listens for `aionui:speech-to-text-config-changed`.                                           |
| `ThoughtDisplay.tsx`     | Renders agent "thought" (subject/description) as an Arco `Tag` with a running elapsed-time timer and localized time units; gradient background varies by theme.                                                   |

## Subdirectories

| Directory           | Purpose                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `AtFileMenu`        | @-mention file picker menu for the input box (see `AtFileMenu/AGENTS.md`).                              |
| `BtwOverlay`        | "By the way" overlay command UI and its `useBtwCommand` hook (see `BtwOverlay/AGENTS.md`).              |
| `MobileActionSheet` | Mobile-style action sheet with attach-entry hook for input actions (see `MobileActionSheet/AGENTS.md`). |
| `SendBox`           | Main chat message input/send box component (see `SendBox/AGENTS.md`).                                   |

## For AI Agents

- Renderer process only — no Node.js APIs; cross-process work goes through the IPC bridge / `configService` from `@/common`.
- These are mostly controlled presentational components: behavior is driven by callback props (e.g. `CommandQueuePanel`, `SlashCommandMenu`), so keep state in the caller, not here.
- Use Arco components and `@icon-park/react` icons; styling is UnoCSS utility classes plus inline `var(--color-*)` CSS variables and theme branches via `useThemeContext` — do not hardcode colors.
- All user-facing text uses `react-i18next` `t()` keys (e.g. `conversation.chat.speech.*`); add new keys to locale JSON, never inline strings.

## Dependencies

### Internal

- `@/renderer/hooks/context/ThemeContext`, `@/renderer/hooks/system/useSpeechInput`, `@/renderer/pages/conversation/platforms/useConversationCommandQueue`, `@/common/config/configService`

### External

- `@arco-design/web-react`, `@icon-park/react`, `@dnd-kit/core` `/sortable` `/utilities`, `react-i18next`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
