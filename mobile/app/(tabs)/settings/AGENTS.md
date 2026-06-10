<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# settings

## Purpose
Settings tab for the React Native mobile app (Expo Router). Renders the connection status / server address panel, a "change server" (disconnect) action, and an About section with the app version.

## Key Files
| File | Description |
| --- | --- |
| `_layout.tsx` | Expo Router `Stack` for the settings tab; declares the `index` screen with title `t('settings.title')`. |
| `index.tsx` | `SettingsScreen` — reads `config`, `connectionState`, `disconnect`, `tryReconnect` from `useConnection`; shows status dot, server `host:port`, a reconnect row (when not connected), a disconnect button with confirmation `Alert`, and a hardcoded version `0.1.0`. |

## For AI Agents
- React Native (Expo) screen, NOT Electron renderer: use `react-native` primitives (`View`, `ScrollView`, `TouchableOpacity`, `StyleSheet`, `Alert`, `ActivityIndicator`) and `@expo/vector-icons` `Ionicons` — no DOM, no Arco, no UnoCSS here.
- Colors come from the `useThemeColor` hook (tokens: `surface`, `border`, `success`, `error`, `tint`); do not hardcode colors. Styles via `StyleSheet.create`.
- All user-facing text uses `react-i18next` `t(...)` keys under `settings.*` / `common.*` / `connect.*` — keep this convention.
- The version string `0.1.0` in `index.tsx` is currently hardcoded; update it there if a dynamic version source is added.

## Dependencies
### Internal
- `../../../src/components/ui/ThemedText`
- `../../../src/context/ConnectionContext` (`useConnection`)
- `../../../src/hooks/useThemeColor`
### External
- `expo-router` (`Stack`), `react-native`, `react-i18next`, `@expo/vector-icons`

<!-- MANUAL: notes below this line are preserved on regeneration -->
