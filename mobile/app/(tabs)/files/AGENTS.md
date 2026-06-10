<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# files

## Purpose
The "Files" tab of the React Native (Expo Router) mobile app. It hosts a drawer-based workspace file browser: a sidebar drawer for selecting files and a main screen that renders the active file's contents as tabs.

## Key Files
| File | Description |
| --- | --- |
| `_layout.tsx` | Expo Router `Drawer` layout for the Files tab. Renders `WorkspaceFilesSidebar` as the drawer content (`drawerType: 'front'`, width `85%`, themed background) and declares the single `index` screen with `headerShown: false`. |
| `index.tsx` | Default Files screen. Reads open tabs from `useFilesTab` and the active project from `useWorkspace`; resets tabs via `closeAllTabs()` when `workspaceChanged`. Renders `MobileFileTabHeader` (with an `onOpenDrawer` that dispatches `DrawerActions.openDrawer`), then shows a no-workspace empty state, a no-open-file empty state, or `FileContentView` for the current tab's `path`. |

## For AI Agents
- React Native / Expo Router only — no DOM and no web Arco components here. Use `react-native` primitives (`View`, `StyleSheet`) and `@expo/vector-icons` (`Ionicons`), not `@icon-park/react`.
- Navigation uses `@react-navigation` drawer APIs; open the sidebar with `DrawerActions.openDrawer()` rather than custom state.
- Theming goes through `useThemeColor({}, 'background' | 'icon')` and `ThemedText`; do not hardcode colors.
- All user-facing strings use `react-i18next` `t(...)` keys (`workspace.noWorkspace`, `files.empty`). Add new keys to the mobile locale files, never hardcode.
- File-browser logic lives in shared components (`WorkspaceFilesSidebar`, `MobileFileTabHeader`, `FileContentView`) and contexts (`FilesTabContext`, `WorkspaceContext`) under `mobile/src/`; this directory is just routing/composition.

## Dependencies
### Internal
- `mobile/src/components/files/` (`WorkspaceFilesSidebar`, `MobileFileTabHeader`, `FileContentView`)
- `mobile/src/components/ui/ThemedText`
- `mobile/src/context/` (`FilesTabContext`, `WorkspaceContext`)
- `mobile/src/hooks/useThemeColor`
### External
- `expo-router` (Drawer), `@react-navigation/drawer`, `@react-navigation/native`, `@react-navigation/routers`
- `@expo/vector-icons`, `react-native`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
