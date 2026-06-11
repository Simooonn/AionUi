<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# BtwOverlay

## Purpose

Renders the "by the way" (`/btw`) side-question feature: a floating overlay that asks a one-off question against the current conversation without disturbing the running task, and shows the streamed answer. The overlay is positioned below the chat header and above the composer anchor, with its own state machine for the request lifecycle.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`             | `BtwOverlay` component. Renders via `ReactDOM.createPortal` into `document.body` with a backdrop + centered panel. Computes `left`/`top`/`width`/`maxHeight` from the `.chat-layout-header` rect and an optional `anchorEl`, recomputing on `resize`/`scroll`. Binds `Escape`/`Enter`/`Space` to dismiss, but only after `DISMISS_BIND_DELAY_MS` (200ms) so the Enter that submitted `/btw` does not auto-close it. Shows question bubble, `Spin` while loading, and answer via `MarkdownView`. |
| `useBtwCommand.ts`      | `useBtwCommand(conversation_id?, enabled)` hook owning `{ answer, isLoading, isOpen, question }` plus `ask` / `dismiss`. `ask` calls `ipcBridge.conversation.askSideQuestion.invoke`, maps response `status` (`ok` / `noAnswer` / `unsupported` / `toolsRequired` / `invalid`) to an Arco `Message` toast + answer text, and uses a `requestIdRef` counter to ignore stale responses. Resets state when conversation changes or `enabled` flips off.                                            |
| `BtwOverlay.module.css` | Scoped styles: fixed full-screen `.portalRoot` (z-index 9999), translucent `.backdrop`, `pointer-events:none` `.panelWrap`, blurred `.overlay` card, and `.questionBubble` / `.answerBubble` chat bubbles using semantic CSS variables.                                                                                                                                                                                                                                                         |

## For AI Agents

- Renderer-only code — no Node.js APIs. Uses DOM measurement (`getBoundingClientRect`, `window.innerWidth/Height`) and a `ReactDOM.createPortal` to `document.body`.
- All user-facing strings come from `conversation.sideQuestion.*` i18n keys (e.g. `title`, `loading`, `dismissHint`, `started`, `answered`, `error`, `unsupported`, `noAnswer`, `toolsRequired`, `emptyQuestion`). Add new strings as i18n keys, never inline.
- The IPC contract is `ipcBridge.conversation.askSideQuestion`; its `status` union is duplicated in the `statusMap` in `useBtwCommand.ts` — keep them aligned with the main-process handler.
- Stale-response guard relies on `requestIdRef`; preserve the `++requestIdRef.current` increment in both `ask` and `dismiss` when refactoring.
- Layout magic numbers (`VIEWPORT_MARGIN_PX`, `CHROME_RESERVE_HEIGHT_PX`, etc.) are tuned constants at the top of `index.tsx`; adjust there rather than hardcoding inline.

## Dependencies

### Internal

- `@/common` (`ipcBridge`)
- `@/renderer/components/Markdown` (`MarkdownView`)

### External

- `react`, `react-dom` (portal), `react-i18next`
- `@arco-design/web-react` (`Spin`, `Message`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
