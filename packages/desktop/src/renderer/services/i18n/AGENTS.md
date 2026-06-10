<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# i18n

## Purpose
Renderer-side i18next runtime: initializes `i18next` + `react-i18next`, statically imports every supported locale bundle, and wires language selection to `configService` (the single source of truth) and the IPC bridge for cross-renderer sync (desktop ↔ WebUI). This is the module components consume via `useTranslation`.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Configures and exports the `i18n` singleton. Statically imports all 9 locales (en-US, zh-CN, ja-JP, zh-TW, ko-KR, tr-TR, ru-RU, uk-UA, pt-BR), merges non-default locales with the en-US fallback, picks initial language from localStorage/injected/system hints (avoids the language-detector origin bug, Issue #1176), then defers to `configService` once ready. Exports `changeLanguage`, `clearTranslationCache`, `getLoadedLanguages`, `supportedLanguages`, `normalizeLanguageCode`, and re-exports types `I18nKey`, `I18nModule`, `SupportedLanguage`. |
| `i18n-keys.d.ts` | AUTO-GENERATED (by `scripts/generate-i18n-types.js`) — DO NOT EDIT. Defines the `I18nKey` union of every translation key for type-safe `t()` calls. |
| `README.md` | Usage docs (partially stale — still references a two-language `zh-CN.json`/`en-US.json` layout). |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `locales` | One folder per language (`en-US`, `zh-CN`, `ja-JP`, `zh-TW`, `ko-KR`, `tr-TR`, `ru-RU`, `uk-UA`, `pt-BR`); each holds per-module JSON files (`common.json`, `conversation.json`, `settings.json`, `tools.json`, etc.) plus an `index.ts` barrel that aggregates them. |

## For AI Agents
- Renderer process: NO Node.js APIs. Browser globals here are accessed defensively (`typeof localStorage === 'undefined'` guards) because this code also runs in WebUI mode.
- `configService.get('language')` is the authoritative language; localStorage/`window.__initialLanguage`/`navigator.language` are only fast hints to avoid FOUC on first paint.
- Locales are imported statically (not lazy/dynamic) so the packaged app can always switch language offline — add a new language by importing it into `localeData` and updating `i18n-config.json`.
- Never hand-edit `i18n-keys.d.ts`; regenerate via the i18n script after changing locale JSON (see the `i18n` skill).
- Language changes broadcast through `ipcBridge.systemSettings.changeLanguage`/`languageChanged` to keep the main process (tray menu) and other renderers in sync; the listener self-skips when already on the target language.

## Dependencies
### Internal
- `@/common/config/configService`, `@/common/config/i18n` (`DEFAULT_LANGUAGE`, `normalizeLanguageCode`, `mergeWithFallback`, `ensureAndSwitch`, types), `@/common/config/i18n-config.json`, `@/common` (`ipcBridge`).
### External
- `i18next`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
