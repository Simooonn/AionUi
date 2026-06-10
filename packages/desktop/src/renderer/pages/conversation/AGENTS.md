<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# conversation

## Purpose
The chat conversation page of the renderer. The route entry (`index.tsx`) resolves the `:id` route param to a conversation record and renders the full chat UI (`components/ChatConversation`). This directory tree holds everything for an active conversation: message rendering, file/preview panes, workspace view, history grouping, runtime wiring, and per-platform behavior.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | Route component `ChatConversationIndex`. Reads `:id` via `useParams`, loads the conversation through SWR + `getConversationOrNull`, re-fetches on `ipcBridge.conversation.listChanged` events, auto-syncs the title from history when still named the default, closes the preview pane on conversation change, and redirects to `/` with a toast when the conversation is missing. Shows `<Spin>` while loading, else mounts `ChatConversation`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `GroupedHistory` | Conversation history list grouped/sectioned for the sidebar (see `GroupedHistory/AGENTS.md`). |
| `Messages` | Rendering of chat message types and message-stream UI (see `Messages/AGENTS.md`). |
| `Preview` | File/content preview panel and its context provider (`usePreviewContext`) (see `Preview/AGENTS.md`). |
| `Workspace` | Workspace/file-tree side panel for the conversation (see `Workspace/AGENTS.md`). |
| `components` | Shared conversation UI components, incl. `ChatConversation` root (see `components/AGENTS.md`). |
| `hooks` | Conversation-scoped React hooks (see `hooks/AGENTS.md`). |
| `platforms` | Per-agent/per-platform conversation behavior and config (see `platforms/AGENTS.md`). |
| `runtime` | Runtime wiring for live conversation state/streaming (see `runtime/AGENTS.md`). |
| `utils` | Conversation helpers incl. `conversationCache` (`getConversationOrNull`) (see `utils/AGENTS.md`). |

## For AI Agents
- Renderer process only: no Node.js APIs. Cross-process access goes through `ipcBridge` from `@/common` (e.g. `ipcBridge.conversation.listChanged.on`, which returns an unsubscribe function used as the effect cleanup).
- Data loading uses SWR keyed `conversation/${id}`; mutate on IPC change events rather than polling.
- User-facing strings use i18n keys via `useTranslation` (e.g. `conversation.notFound`, `conversation.welcome.newConversation`)—never hardcode.
- Default-title detection drives auto-titling: compare `data.name` against the translated default before calling `syncTitleFromHistory`.
- Preview state is shared via `usePreviewContext` from `./Preview`; the page closes the preview on every id change because React Router may remount and reset refs.

## Dependencies
### Internal
- `@/common` (ipcBridge)
- `@/renderer/pages/conversation/Preview`, `./components/ChatConversation`, `./utils/conversationCache`
- `@/renderer/hooks/chat/useAutoTitle`
### External
- `react`, `react-router-dom`, `react-i18next`, `swr`, `@arco-design/web-react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
