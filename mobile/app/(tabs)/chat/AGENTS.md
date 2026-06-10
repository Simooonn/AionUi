<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose
Expo Router route group for the mobile app's Chat tab. Wraps the chat screen in a drawer navigator (conversation sidebar) and switches the route body between an empty state, a pending-agent screen, and the live chat session based on conversation context.

## Key Files
| File | Description |
| --- | --- |
| `_layout.tsx` | Drawer navigator layout (`expo-router/drawer`). Renders `ChatSidebar` as drawer content; custom header shows the active/pending conversation name plus current workspace name. Includes a `DrawerMenuButton` that toggles the drawer. Pulls state from `useConversations` and `useWorkspace`; colors from `useThemeColor`. |
| `index.tsx` | Default Chat screen. Branches on `useConversations()`: renders `PendingChatScreen` when a `pendingAgent` is set with no active conversation, `ChatEmptyState` when neither exists, otherwise mounts `ChatScreen` inside `ChatProvider` keyed by `activeConversationId`. |

## For AI Agents
- React Native / Expo Router code (mobile app) — not the Electron desktop renderer. No DOM, no `@arco-design` or `@icon-park`; use `react-native` primitives and `@expo/vector-icons` (`Ionicons`).
- File-based routing: `_layout.tsx` defines the navigator; `index.tsx` is the route screen. The `(tabs)` parent and `chat` segment are route groups, not URL segments.
- Theme colors come exclusively from `useThemeColor({}, '<token>')` (e.g. `background`, `text`, `textSecondary`, `tint`) — do not hardcode hex values.
- `ChatScreen` is intentionally remounted via `key={activeConversationId}` so switching conversations resets `ChatProvider` state. Preserve this key when editing.
- Imports reach into the mobile shared tree with deep relative paths (`../../../src/...`); there are no path aliases used here.

## Dependencies
### Internal
- `mobile/src/components/chat` (`ChatSidebar`, `ChatScreen`, `ChatEmptyState`, `PendingChatScreen`)
- `mobile/src/components/ui` (`ThemedText`)
- `mobile/src/context` (`ConversationContext`, `WorkspaceContext`, `ChatContext`)
- `mobile/src/hooks` (`useThemeColor`)

### External
- `expo-router/drawer`, `@expo/vector-icons`, `react-native`, `@react-navigation/native`, `@react-navigation/routers`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
