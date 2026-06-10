<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# app

## Purpose
Expo Router file-based routing root for the AionUi React Native mobile app. Defines the navigation stack, mounts global context providers, and holds the top-level screens (entry redirect, QR/paste connect flow, file preview). The `(tabs)` group holds the main tabbed UI.

## Key Files
| File | Description |
| --- | --- |
| `_layout.tsx` | Root layout. Calls `SplashScreen.preventAutoHideAsync()` and `initI18n()` at module load, then nests providers (`Connection`, `WebSocket`, `Conversation`, `Workspace`, `FilesTab`) and a `react-navigation` ThemeProvider around the `Stack`. Declares `index`, `connect`, `(tabs)`, and `file-preview` screens. |
| `index.tsx` | Entry screen — no UI. Reads `useConnection()`; while `isRestoring` keeps splash up, else hides it. Redirects to `/connect` when not configured or `auth_failed` persists >5s, otherwise to `/(tabs)/chat`. |
| `connect.tsx` | Connection screen. Two modes (`scan`/`paste`). Parses a `/qr-login?token=` URL, POSTs to `http://host:port/api/auth/qr-login` for a JWT, calls `connect()`, then waits up to 5s for `wsService` `connected` state before redirecting to chat. Default port `25808`. |
| `file-preview.tsx` | File preview screen taking `path`/`name`/`size` params. Classifies by extension (markdown/code/html/diff/image/unsupported), enforces a 1 MB cap, fetches via `bridge.request('read-file' \| 'get-image-base64')`, renders text through `MarkdownContent`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `(tabs)` | Expo Router tab group — the main authenticated tabbed UI (chat, files, etc.) (see `(tabs)/AGENTS.md`) |

## For AI Agents
- React Native + Expo Router only — NOT the Electron renderer. No DOM, no Arco, no UnoCSS, no `@icon-park/react`. Use `react-native` primitives, `@expo/vector-icons` (Ionicons), and `StyleSheet.create`.
- All user-facing text goes through `react-i18next` `t('...')`; theme colors come from `useThemeColor({}, 'tint' | 'background' | 'text')`, not hardcoded (overlay/scanner colors are an intentional exception).
- Backend access uses `bridge.request<T>(channel, params)` (file reads) and the `wsService` singleton (connection state); both live in `../src/services/`. Provider nesting order in `_layout.tsx` is load-bearing — `ConnectionProvider` must wrap `WebSocketProvider`.
- New routes are files here; register the corresponding `<Stack.Screen name=...>` in `_layout.tsx`.

## Dependencies
### Internal
`../src/context/*` (Connection, WebSocket, Conversation, Workspace, FilesTab), `../src/services/{websocket,bridge}`, `../src/components/ui/ThemedText`, `../src/components/chat/MarkdownContent`, `../src/hooks/useThemeColor`, `../src/i18n`
### External
`expo-router`, `expo-splash-screen`, `expo-status-bar`, `expo-camera`, `@expo/vector-icons`, `@react-navigation/native`, `react-native-safe-area-context`, `react-native-gesture-handler`, `react-native-reanimated`, `react-i18next`, `axios`

<!-- MANUAL: notes below this line are preserved on regeneration -->
