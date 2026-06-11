<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# settings

## Purpose

Renderer-side UI building blocks for the application settings surface: small standalone controls (language, font size, UI scale), a filesystem directory/file picker modal, and the app auto-update modal. The composite settings panels that wire these together live in `SettingsModal/`.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DirectorySelectionModal.tsx` | Arco `Modal` file/folder browser. Lists entries by HTTP-fetching `${getBaseUrl()}/api/fs/browse?path=&showFiles=` (credentials included), supports navigating up, single-select; `isFileMode` toggles file vs. directory selection. Calls `onConfirm(paths)`.                                              |
| `UpdateModal.tsx`             | Auto-update flow modal driven by `ipcBridge.update`/`ipcBridge.autoUpdate`. State machine over `checking → upToDate/available → downloading → downloaded/success → error`; handles electron-updater auto-update vs. manual asset download, shows `Progress`, and renders release notes via `MarkdownView`. |
| `ScaleControl.tsx`            | UI-scale control (slider + buttons) reading/writing `fontScale` from `ThemeContext`. Uses transient `draggingValue` so scaling applies only on release; bounds/step from `useFontScale` constants.                                                                                                         |
| `FontSizeStepper.tsx`         | Presentational `− [value] + ↺` integer-px stepper. Pure props (`value/min/max/step/defaultValue/onChange`); parent owns clamping/persistence.                                                                                                                                                              |
| `LanguageSwitcher.tsx`        | `AionSelect` of supported locales (zh-CN, zh-TW, ja-JP, ko-KR, tr-TR, ru-RU, uk-UA, en-US) calling `changeLanguage`; blurs and defers via double `requestAnimationFrame` to avoid layout race with the dropdown.                                                                                           |

## Subdirectories

| Directory       | Purpose                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SettingsModal` | Composite settings dialog and per-section panels that compose the controls here (see `SettingsModal/AGENTS.md`). |

## For AI Agents

- Renderer-only: no Node.js APIs. Reach the main process exclusively through `ipcBridge` (`@/common`) or the HTTP bridge (`getBaseUrl()` from `@/common/adapter/httpBridge`); `DirectorySelectionModal` uses the latter, `UpdateModal` the former.
- All user-facing text goes through `useTranslation`/i18n keys (e.g. `settings.fontSize*`); do not hardcode strings.
- Prefer Arco components and `@icon-park/react` icons; styling uses UnoCSS utility classes (see `FontSizeStepper`). `UpdateModal` mixes `@arco-design/web-react/icon` and `@icon-park/react` — match the file you edit.
- Scale/font controls intentionally defer applying changes (dragging value, parent clamps); keep that pattern to avoid layout thrash and over-persisting.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/adapter/httpBridge`, `@/common/update/updateTypes`, `@renderer/components/base` (AionSelect, AionModal), `@renderer/components/Markdown`, `@renderer/hooks/context/ThemeContext`, `@renderer/hooks/ui/useFontScale`, `@/renderer/services/i18n`

### External

`@arco-design/web-react`, `@icon-park/react`, `react`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
