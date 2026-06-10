<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# (tabs)

## Purpose
Expo Router route group defining the mobile app's bottom tab navigation. `_layout.tsx` wires the three primary tabs (Chat, Files, Settings) and gates them behind connection state, redirecting to the root route when the device is not configured.

## Key Files
| File | Description |
| --- | --- |
| `_layout.tsx` | `TabLayout` component using `expo-router` `<Tabs>`. Registers `chat`, `files`, `settings` screens with i18n titles (`tabs.chat`/`tabs.files`/`tabs.settings`) and `Ionicons` tab icons. Wraps content in `SafeAreaView` + a `ConnectionBanner`, applies themed active/inactive tint colors, and `router.replace('/')` when `useConnection().isConfigured` is false. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `chat` | Chat tab route (conversation list / messaging) (see `chat/AGENTS.md`) |
| `files` | Files tab route (file browsing) (see `files/AGENTS.md`) |
| `settings` | Settings tab route (see `settings/AGENTS.md`) |

## For AI Agents
- This is React Native / Expo Router code (mobile app), NOT the Electron renderer — use RN primitives and `@expo/vector-icons`, not `@arco-design/web-react` or `@icon-park/react`.
- Tab screen `name` values must match the subdirectory names (`chat`, `files`, `settings`) for routing to resolve.
- Each tab sets `headerShown: false` here so individual screens render their own headers.
- Colors come from `useThemeColor` tokens (`tint`, `tabIconDefault`, `background`) — do not hardcode hex values.
- The disconnect redirect overrides the top safe-area inset (`SafeAreaInsetsContext` with `top: 0`) because `SafeAreaView edges={['top']}` already applies it; keep this to avoid double padding.

## Dependencies
### Internal
- `../../src/hooks/useThemeColor`
- `../../src/context/ConnectionContext` (`useConnection`)
- `../../src/components/ui/ConnectionBanner`
### External
- `expo-router` (`Tabs`, `useRouter`)
- `react-i18next` (`useTranslation`)
- `@expo/vector-icons` (`Ionicons`)
- `react-native-safe-area-context`

<!-- MANUAL: notes below this line are preserved on regeneration -->
