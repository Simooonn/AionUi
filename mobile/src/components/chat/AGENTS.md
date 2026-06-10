<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose
React Native chat UI for the AionUi mobile app: the conversation transcript (message bubbles, tool-call summaries, markdown, permission cards), the input bar, the drawer-based conversation sidebar, the pre-send "pending chat" config screen, and the bottom-sheet pickers for workspace/files/model/mode.

## Key Files
| File | Description |
| --- | --- |
| `ChatScreen.tsx` | Main transcript view. `FlatList` over `useProcessedMessages`; renders `ToolCallSummary` for `tool_summary` items, else `MessageBubble`. Auto-scrolls to bottom, shows streaming `thought.subject` indicator, hosts `ChatInputBar`. Reads state from `useChat`. |
| `MessageBubble.tsx` | Switches on `TMessage.type`: `text` (user right / assistant via `MarkdownContent`), `tips`, `agent_status`, `acp_permission`/`codex_permission` (→ `ConfirmationCard`), `plan` (entries with status emoji). |
| `MarkdownContent.tsx` | Renders assistant markdown via `react-native-markdown-display`; custom `fence` rule adds language label + copy-to-clipboard (`expo-clipboard`). Theme-driven styles via `useThemeColor`. |
| `ToolCallSummary.tsx` | Collapsible group summary for a `tool_summary`. Auto-expands while streaming+incomplete; uses helpers from `useProcessedMessages` (`isGroupComplete`, `countSteps`, `countErrors`, `getCurrentStepName`). Per-step rows expand into `ToolCallBlock`. |
| `ToolCallBlock.tsx` | Renders one tool call by type (`tool_call`/`tool_group`/`acp_tool_call`/`codex_tool_call`). Exports `useStatusIcons`, `mapAcpStatus`, plus `WebSearchBlock` and `DiffBlock` (parses unified diff stats) for codex subtypes. |
| `ConfirmationCard.tsx` | ACP/codex permission prompt. Reads `confirmation.options`, infers approve vs deny by value/label, calls `useChat().confirmAction(id, callId, value)`. |
| `ChatInputBar.tsx` | Multiline `TextInput` (max 10000 chars) with send / stop toggle driven by `isStreaming`; `onSend(text, files?)`. |
| `PendingChatScreen.tsx` | Pre-conversation config: probes `acp.probe-model-info` via `bridge`, derives recent workspaces, option pills for workspace/files/model/mode (workspace↔files mutually exclusive), then `commitNewChat(text, options)`. |
| `ChatSidebar.tsx` | Drawer content (`DrawerContentComponentProps`). Search + grouped history (`buildGroupedHistory`), rename/delete via `Alert`/`ActionSheetIOS` (Android inline-input fallback), `WorkspaceGroup` rows, `NewConversationModal`. |
| `ChatEmptyState.tsx` | Empty placeholder with "new chat" button opening `NewConversationModal`. |
| `WorkspaceGroup.tsx` | Collapsible workspace group in the sidebar; animated chevron via `react-native-reanimated`. |
| `WorkspacePickerSheet.tsx` / `ModelPickerSheet.tsx` / `ModePickerSheet.tsx` | Bottom-sheet `Modal` lists for picking recent workspace / ACP model / agent mode. `ModePickerSheet` also exports `showModeActionSheet` (iOS `ActionSheetIOS`). |
| `FilePickerSheet.tsx` | Bottom-sheet file tree. Fetches via `bridge.request('get-file-by-dir', { dir, root })`, flattens/sorts nodes, multi-select with checkboxes, returns selected full paths. |

## For AI Agents
- React Native only — NO DOM, no `@arco-design/web-react`, no UnoCSS. Use RN primitives (`View`, `Text` via `ThemedText`, `TouchableOpacity`, `FlatList`, `Modal`) and `@expo/vector-icons` `Ionicons` (NOT `@icon-park/react`).
- Colors come exclusively from `useThemeColor({}, '<token>')`; never hardcode hex (except the few `#fff` on tinted buttons already present). Styles use `StyleSheet.create`.
- All user-facing text uses `useTranslation()` `t('...')` keys under the `chat.*`, `conversations.*`, `workspace.*`, `files.*`, `common.*` namespaces. Note: a few helper functions (`parseDiffStats`, `showModeActionSheet`, `getStepItems`) call `t(...)` outside a component scope — preserve that pattern or move the call into the component.
- Main-process data is reached through `bridge.request(channel, payload)` from `../../services/bridge` (e.g. `acp.probe-model-info`, `get-file-by-dir`) — there is no direct Node access.
- Message shapes are loosely typed (`content: any`); the canonical type is `TMessage` from `../../utils/messageAdapter`. Status strings are normalized in multiple places (`mapAcpStatus`, `normalizeStatus`, `normalizeAcpStatus`) — keep them consistent.
- Platform branches matter: iOS uses `ActionSheetIOS`/`Alert.prompt`; Android has explicit fallbacks (e.g. inline rename input in `ChatSidebar`).

## Dependencies
### Internal
- `../ui/ThemedText`, `../conversation/NewConversationModal`
- `../../context/ChatContext` (`useChat`), `../../context/ConversationContext` (`useConversations`)
- `../../hooks/useThemeColor`, `../../hooks/useProcessedMessages`
- `../../services/bridge`, `../../utils/messageAdapter`, `../../utils/groupingHelpers`, `../../constants/agentModes`
### External
- `react-native`, `@expo/vector-icons`, `react-i18next`
- `react-native-markdown-display`, `expo-clipboard`, `react-native-reanimated`, `@react-navigation/drawer`

<!-- MANUAL: notes below this line are preserved on regeneration -->
