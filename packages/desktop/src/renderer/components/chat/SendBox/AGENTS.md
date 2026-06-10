<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# SendBox

## Purpose
The chat message composer at the bottom of every conversation. `SendBox` is a single large controlled-input component handling typing, multi-line auto-grow, send/stop, file attachments (drag/paste/`@file` mentions), `/slash` commands, `/btw` overlay, speech input, reply quotes, and input history.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | The `SendBox` React.FC. Renders an Arco `Input.TextArea` plus send/stop buttons and tool slots. Manages: single-vs-multi-line mode (switches above `MAX_SINGLE_LINE_CHARACTERS = 800`), `@`-file mention menu (`AtFileMenu` + `atFileQuery` utils), slash-command menu (`SlashCommandMenu` + `useSlashCommandController`), `/btw` command (`BTW_COMMAND_RE`, `BtwOverlay`/`useBtwCommand`), drag/paste/upload (`useDragUpload`, `usePasteService`, `useUploadState`), speech input, reply quotes, and per-conversation input history. Exported as `default`. |
| `sendbox.css` | Plain CSS overriding Arco button styles — `.send-button-custom` disabled/dark states and `.sendbox-stop-button` border/shadow resets. Imported directly by `index.tsx`. |

## For AI Agents
- Renderer process only — no Node.js APIs. All host access goes through `ipcBridge` from `@/common`.
- `SendBox` is fully controlled: `value`/`onChange` come from the parent; `onSend`/`onStop` return `Promise`. Many optional props gate features (`enableBtw`, `slash_commands`, `defaultMultiLine`/`lockMultiLine`, `compactActions`, `allowSendWhileLoading`, mobile-only `onMobilePlusClick`).
- This is one ~1600-line file; most logic lives in extracted hooks/utils under `@/renderer/hooks/chat`, `.../file`, and `@/renderer/utils/chat`. Prefer editing those over inflating `index.tsx`.
- Watch IME: `useCompositionInput` and `MAX_SINGLE_LINE_CHARACTERS` exist to keep typing/layout cheap — don't add synchronous width measurement on every keystroke.
- User-facing strings use `useTranslation` i18n keys; never hardcode text. Use `@arco-design/web-react` components (no raw `<button>`/`<textarea>`) and `@icon-park/react` icons.

## Dependencies
### Internal
`@/common` (ipcBridge), sibling chat components (`AtFileMenu`, `BtwOverlay`, `SlashCommandMenu`, `SpeechInputButton`), `@/renderer/components/media/UploadProgressBar`, many `@/renderer/hooks/{chat,file,ui,system,context}`, `@/renderer/utils/{chat,file,ui,emitter}`, `@renderer/services/FileService`, `@renderer/pages/conversation/*`.
### External
`@arco-design/web-react`, `@icon-park/react`, `@office-ai/platform` (theme), `react`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
