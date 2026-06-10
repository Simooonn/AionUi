<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ui

## Purpose
Low-level, theme-aware UI primitives for the React Native mobile app. Holds the themed `Text`/`View` wrappers used throughout the mobile screens and the `ConnectionBanner` that surfaces WebSocket connection state to the user.

## Key Files
| File | Description |
| --- | --- |
| `ThemedText.tsx` | `Text` wrapper resolving color via `useThemeColor`; exposes `type` variants (`default`/`title`/`subtitle`/`caption`/`link`) and per-mode `lightColor`/`darkColor` overrides. `link` type uses the `tint` theme color. |
| `ThemedView.tsx` | `View` wrapper applying the theme `background` color via `useThemeColor`, with optional `lightColor`/`darkColor` props. |
| `ConnectionBanner.tsx` | Animated (reanimated) red banner driven by `useConnection()`. Shows connecting/reconnecting/lost/auth-failed states, a spinner while reconnecting, and becomes tappable to call `tryReconnect()` after a 10s disconnect delay or immediately on `auth_failed`. Labels are i18n keys under `connection.*`. |

## For AI Agents
- React Native code (not Electron renderer): import from `react-native`, never DOM. Styling uses `StyleSheet.create`, not UnoCSS/Arco — Arco and `@icon-park/react` do not apply here.
- Color values: prefer `useThemeColor` keys (`text`, `background`, `tint`) over hardcoding. `ConnectionBanner` hardcodes `#e8453c`/`#fff` for its fixed error styling — leave intentional unless theming the banner.
- `ConnectionBanner` manages timers (`setTimeout`) via refs; preserve the cleanup logic when editing the disconnect/auth-failed effect to avoid leaks.
- All user-facing strings go through `useTranslation()` / `t('connection.*')` — do not hardcode text.

## Dependencies
### Internal
- `../../context/ConnectionContext` (`useConnection`)
- `../../hooks/useThemeColor`
### External
- `react-native`, `react-native-reanimated`, `react-i18next`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
