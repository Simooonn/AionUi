<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# conversation

## Purpose
React Native UI components for the mobile app's conversation list screen: rendering each conversation row, the scrollable list with pull-to-refresh, and the bottom-sheet modal for picking an agent to start a new conversation.

## Key Files
| File | Description |
| --- | --- |
| `ConversationItem.tsx` | Single conversation row (`TouchableOpacity`): name, status dot (running/pending via theme `success`/`warning`), agent-type badge with hardcoded `agentBadgeColors`, model label, and relative time via `formatTime`. Long-press triggers delete confirmation (iOS `ActionSheetIOS`, else `Alert`). |
| `ConversationList.tsx` | `FlashList` of `ConversationItem`s pulling state from `useConversations()`. Handles row press (navigates to `/conversation/:id` via expo-router), swipe-to-refresh (`RefreshControl`), delete, and an empty state. |
| `NewConversationModal.tsx` | Slide-up transparent `Modal` listing `availableAgents` from context; calls `fetchAgents()` on open, renders an icon + label per agent (`agentIcons` map), invokes `onAgentSelected` then closes. |

## For AI Agents
- This is the **mobile (React Native)** app, not Electron renderer/main. Use `react-native` primitives (`View`, `TouchableOpacity`, `FlashList`/`FlatList`, `Modal`) — no DOM, no Arco, no UnoCSS.
- Text comes from `ThemedText` (`../ui/ThemedText`); colors from `useThemeColor({}, 'token')` (`../../hooks/useThemeColor`) — do not hardcode theme colors. Note the agent badge/icon color maps here ARE hardcoded brand colors by design.
- All user-facing strings use `react-i18next` `t(...)` keys under `conversations.*` / `common.*` / `workspace.*`.
- Conversation/agent data and mutations (`deleteConversation`, `fetchAgents`, `availableAgents`) come from `useConversations()` in `../../context/ConversationContext`; `Conversation` and `AgentInfo` types are imported from there.
- Gotcha: `formatTime` in `ConversationItem.tsx` (lines 33-34) calls `t('workspace.yesterday')`, but `t` is a component-scoped hook value not available in this module-level function — the "yesterday" branch will throw. Fix by passing `t` in or formatting differently if you touch this.

## Dependencies
### Internal
- `../ui/ThemedText`, `../../hooks/useThemeColor`, `../../context/ConversationContext`

### External
- `react-native`, `@shopify/flash-list`, `expo-router`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
