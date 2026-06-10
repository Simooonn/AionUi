<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# context

## Purpose
React Context providers for the AionUi mobile (React Native) app. They hold the global client state — WebSocket connection/auth, conversation list, active chat stream, file editor tabs, and derived workspace info — and expose typed `useXxx` hooks consumed across screens. State is sourced over the WebSocket bridge to a remote AionUi desktop instance, not from a local backend.

## Key Files
| File | Description |
| --- | --- |
| `ConnectionContext.tsx` | Owns connection config (host/port/token), persists it to `expo-secure-store`, restores on mount, and drives reconnection. Wires JWT auth-challenge + heartbeat handlers on `wsService`, proactively refreshing tokens that expire within 1h. Exposes `connect`/`disconnect`/`tryReconnect` and `useConnection()`. |
| `ChatContext.tsx` | Active-conversation message stream. Loads history via `database.get-conversation-messages`, subscribes to `chat.response.stream` (start/finish/thought/content/acp_context_usage) and confirmation events, does optimistic user-message inserts, and sends through `chat.send.message`. Exposes `useChat()`. |
| `ConversationContext.tsx` | Conversation list + new-chat flow. Fetches via `database.get-user-conversations`, polls every 30s, refreshes on app foreground and on chat `finish`. Maps agent backends to ACP/special conversation types in `createConversation`. Handles pending-agent → `commitNewChat` flow. Exposes `useConversations()`. |
| `WebSocketContext.tsx` | Thin provider exposing the `bridge` and `wsService` singletons; reconnects on app foreground. Exposes `useWebSocket()` and `useBridge()`. |
| `FilesTabContext.tsx` | File-editor tab state (open/close/switch), persisted to `AsyncStorage` under `files_tabs_state` with `isDirty` reset on reload. `useFilesTab()` throws if unprovided; `useFilesTabOptional()` does not. |
| `WorkspaceContext.tsx` | Derives `currentWorkspace` and a localized display name from the active conversation's `extra.workspace`; exposes a one-render `workspaceChanged` flag. Exposes `useWorkspace()`. |

## For AI Agents
- React Native code (not desktop renderer): use `react-native` APIs (`AppState`, `AsyncStorage`, `expo-secure-store`) — no DOM and no Node.js APIs.
- All server data flows through `../services/bridge` (`bridge.request`/`bridge.on`) and `../services/websocket` (`wsService`); never assume a local main process.
- Provider order matters: `ConnectionContext` must wrap `ConversationContext`/`ChatContext`/`WebSocketContext`; `WorkspaceContext` depends on `ConversationContext`. Respect this when adding providers.
- `bridge.on('chat.response.stream', ...)` fires for all conversations — handlers here filter by `conversation_id` (Chat) or `type === 'finish'` (Conversation). Keep this filtering when extending.
- Several payloads are typed `any` (confirmations, raw responses) and `ConversationContext` uses object spreads for optional `extra` fields — match the existing pattern rather than tightening types ad hoc.

## Dependencies
### Internal
`../services/bridge`, `../services/websocket`, `../services/api`, `../services/pendingInitialMessages`, `../utils/messageAdapter`, `../utils/uuid`, `../utils/jwt`, `../utils/workspace`
### External
`react`, `react-native`, `expo-secure-store`, `@react-native-async-storage/async-storage`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
