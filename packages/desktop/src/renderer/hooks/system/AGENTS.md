<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# system

## Purpose

Renderer-side React hooks that bridge the app to system- and platform-level concerns: deep links, OS notification clicks, theme application, PWA/desktop environment detection, speech-to-text capture, API protocol detection, and extension-contributed settings tabs and i18n.

## Key Files

| File                                  | Description                                                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useDeepLink.ts`                      | Listens for `aionui://` deep link events via `ipcBridge.deepLink.received`; routes `add-provider`/`provider/add` to `/settings/model` (stashing pre-fill data in a module var consumed via `consumePendingDeepLink`) and whitelist-validated `navigate` actions.      |
| `useNotificationClick.ts`             | Subscribes to `ipcBridge.notification.clicked` and navigates to `/conversation/:id`.                                                                                                                                                                                  |
| `useTheme.ts`                         | Resolves and applies the active theme from `configService` + `BUILTIN_THEMES`/user themes; seeds the main-process relay via `ipcBridge.theme.setActive` and reacts to `theme.changed`. Returns `[activeTheme, selectThemeById]`. Runs an init promise at module load. |
| `usePwaMode.ts`                       | Returns whether the app runs as a standalone PWA (`display-mode: standalone` media query or iOS `navigator.standalone`).                                                                                                                                              |
| `useSpeechInput.ts`                   | Mic recording + file-upload speech-to-text via `SpeechToTextService`; manages availability/status/error-code state, waveform visualizer, and transcript appending. Largest hook here.                                                                                 |
| `useProtocolDetection.ts`             | Debounced auto-detection of an API endpoint's protocol via `ipcBridge.mode.detectProtocol`, with request-version cancellation and manual `detect`/`reset`.                                                                                                            |
| `useExtensionSettingsTabs.ts`         | Shared, module-cached subscriber for extension settings tabs; single in-flight request per session, refreshed on `extensions.stateChanged`.                                                                                                                           |
| `useExtI18n.ts`                       | Resolves localized extension settings-tab names; loads ext i18n for current locale and deep-gets `extension.settingsTabs.{id}.name`, falling back to `tab.label`.                                                                                                     |
| `useAutoPreviewOfficeFilesEnabled.ts` | Reads `system.autoPreviewOfficeFiles` config (default `true`); also exports `isOfficeAutoPreviewTriggerMessage` and `findNewOfficeFiles` helpers.                                                                                                                     |

## For AI Agents

- Renderer-only code: no Node.js APIs. All cross-process access goes through `ipcBridge` (`@/common`) or `extensions as extensionsIpc` from `@/common/adapter/ipcBridge`.
- IPC event subscriptions (`.on(handler)`) return an unsubscribe function — return it directly from `useEffect` (as done here). Don't drop it.
- Two hooks use module-level singletons deliberately: `useExtensionSettingsTabs` (shared cache/in-flight request) and `useTheme`/`useDeepLink` (module vars). Preserve this pattern; don't make per-instance copies.
- DOM/browser-feature checks (`usePwaMode`, `useSpeechInput`) guard `window`/`navigator` with `typeof` and try/catch because the renderer also runs in the mobile/PWA context.
- Comments are English (some bilingual EN/中文 in `useProtocolDetection`/`useNotificationClick`); keep new comments English per project rules.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/adapter/ipcBridge`, `@/common/config/configService`, `@/common/theme/*`, `@/renderer/hooks/config/useConfig`, `@/renderer/hooks/ui/useLatestRef`, `@/renderer/services/SpeechToTextService`, `@/renderer/utils/theme/applyTheme`, `@/renderer/utils/platform`, `@renderer/theme/builtinThemes`.

### External

`react`, `react-router-dom`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
