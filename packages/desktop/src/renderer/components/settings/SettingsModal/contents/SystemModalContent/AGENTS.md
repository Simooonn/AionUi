<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# SystemModalContent

## Purpose
Renderer-side "System" tab of the settings modal. Renders system-level preferences (language, start-on-boot, close-to-tray, hardware acceleration, ACP timeouts, upload/preview toggles, notifications), work/log directory pickers, and a dev-only CDP/DevTools panel. Reads/writes config via `configService` and the `ipcBridge`.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | `SystemModalContent` — the tab root. Builds a `preferenceItems` array of label/control rows, loads status from `ipcBridge.application` (start-on-boot, GPU) and `configService`, applies optimistic updates with rollback, and confirms restart-requiring changes (dir change, hardware acceleration) via `Modal.useModal`. Loads `systemInfo` with `useSWR`. |
| `DevSettings.tsx` | Dev-mode-only panel (returns `null` when `status.isDevMode === false`). Toggles DevTools and CDP remote debugging, shows the live CDP port, and renders copyable `chrome-devtools` / `playwright` MCP config snippets. Uses `useSWR('cdp.status')` + `mutate`. |
| `DirInputItem.tsx` | Read-only directory field rendered inside a `Form.Item` render-prop; opens a native folder picker via `ipcBridge.dialog.showOpen` and writes the chosen path back into the form. |
| `PreferenceRow.tsx` | Presentational label + optional description + right-aligned control row used across this tab. |

## For AI Agents
- Renderer process: no Node.js APIs. All system/file/dialog access goes through `ipcBridge`; reach the main process only via that bridge.
- Config pattern: optimistic `setState` first, then `configService.set(...)` (persisted) with a `.catch` that rolls back via `configService.setLocal(...)`. Match this when adding a preference.
- Restart-required changes (directory edits, hardware acceleration) must confirm with `modal.confirm` and then call `notifyManualRestartRequired(restartResult, t)` after `ipcBridge.application.restart`.
- `updateSystemInfo` still requires `cacheDir`; pass `systemInfo.cacheDir` through unchanged (it is no longer user-editable — see comment in `index.tsx`).
- Gotcha: `DevSettings` is gated on `cdp.status.isDevMode`, not a build flag; in production the whole panel returns `null`.
- All user-facing strings use `t('settings.*')` i18n keys; never hardcode text.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/adapter/ipcBridge` (types `IGpuStatus`, `IStartOnBootStatus`), `@/common/config/configService`
- `@/renderer/components/base/AionScrollArea`, `.../base/FeedbackButton`, `.../settings/LanguageSwitcher`
- `@/renderer/utils/appRestart` (`notifyManualRestartRequired`), `@/renderer/utils/platform` (`isElectronDesktop`), `@/renderer/styles/colors`
- `../../settingsViewContext` (`useSettingsViewMode`)

### External
`@arco-design/web-react`, `@icon-park/react`, `react`, `react-i18next`, `swr`

<!-- MANUAL: notes below this line are preserved on regeneration -->
