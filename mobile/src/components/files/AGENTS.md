<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# files

## Purpose
React Native components for the mobile app's file browsing/preview experience: a workspace file tree sidebar, a multi-tab header for open files, and a per-file content viewer. They render files from the active conversation's workspace by calling the desktop backend over the `bridge` IPC layer.

## Key Files
| File | Description |
| --- | --- |
| `WorkspaceFilesSidebar.tsx` | Drawer sidebar that fetches the workspace tree via `bridge.request('conversation.get-workspace')`, flattens the nested `IDirOrFile` tree into a `FlatList` with expand/collapse + depth indentation, sorts dirs-before-files, and opens a file tab on select. Reacts to workspace/conversation changes. |
| `MobileFileTabHeader.tsx` | Header bar over open file tabs from `FilesTabContext`. Pan-swipe (velocity-based) to switch tabs, a `1/N` count badge, and a bottom-sheet `Modal` listing all tabs (`TabListItem`) with switch/close and "open new file" actions. |
| `FileContentView.tsx` | Renders one file by `path`. Classifies extension into markdown/code/html/diff/image/unsupported; loads text via `read-file` or base64 via `get-image-base64`; renders through `MarkdownContent` (code wrapped in fenced block) or zoomable `Image`. Handles loading/error/retry and unsupported states. |

## For AI Agents
- React Native only — NO DOM and NO Electron/Node APIs here. All backend access goes through `bridge.request(channel, payload)` from `../../services/bridge`.
- Use components from `react-native` and icons from `@expo/vector-icons` (`Ionicons`), not Arco/`@icon-park` (those are desktop-renderer only).
- Colors come from `useThemeColor({}, token)` (tokens: `background`, `border`, `tint`, `text`, `icon`); text uses `ThemedText` from `../ui/ThemedText`. Do not hardcode colors.
- All user-facing strings use `useTranslation()` t-keys (`files.*`, `workspace.*`, `filePreview.*`, `common.*`).
- Tab state lives in `FilesTabContext` (`useFilesTab`); workspace/conversation in `WorkspaceContext`/`ConversationContext`. Don't duplicate this state locally.
- Gotcha: `WorkspaceFilesSidebar` only renders the children of `tree[0]` (the root node) and intentionally omits `fetchFiles` deps (see the `exhaustive-deps` disable). Image extension and unsupported-extension sets in `FileContentView` are the source of truth for content-type routing.

## Dependencies
### Internal
- `../ui/ThemedText`, `../chat/MarkdownContent`
- `../../services/bridge`
- `../../hooks/useThemeColor`
- `../../context/FilesTabContext`, `../../context/WorkspaceContext`, `../../context/ConversationContext`

### External
- `react-native`, `react`
- `@expo/vector-icons` (Ionicons)
- `react-i18next`
- `react-native-gesture-handler` (Pan gesture in tab header)

<!-- MANUAL: notes below this line are preserved on regeneration -->
