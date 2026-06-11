<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# i18n

## Purpose

Main-process i18n runtime. Initializes a dedicated `i18next` instance for the Electron main process so backend code (services, IPC handlers) can produce localized strings without touching the renderer. Locale data is statically imported and bundled by Vite, since main-process JSON files don't exist on disk in production.

## Key Files

| File       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Configures the main-process `i18next` instance. Statically imports all 7 locale bundles (`en-US`, `zh-CN`, `ja-JP`, `zh-TW`, `ko-KR`, `tr-TR`, `ru-RU`) from `@renderer/services/i18n/locales/*`, exposes `i18nReady` (a promise that resolves once init + the user's stored language are applied), plus `setInitialLanguage`, `changeLanguage`, and a re-exported `normalizeLanguageCode`. Default export is the configured `i18n` instance. |

## For AI Agents

- Main-process code only — no DOM APIs. This instance is separate from the renderer's i18next; don't assume shared state.
- Adding a new language requires BOTH a new static `import` and a new `localeData` entry. Dynamic imports will break the production build because locale JSON isn't on disk in the bundled main process.
- Non-default languages are deep-merged onto the English fallback via `mergeWithFallback` (see `getLocaleModules`); missing keys fall back to `en-US`.
- Always `await i18nReady` before reading translations, and call `setInitialLanguage` only after storage (`ProcessConfig`) is initialized. Init errors are caught and logged, not thrown — `i18nReady` never rejects.

## Dependencies

### Internal

- `@process/utils/initStorage` — `ProcessConfig.get('language')` for the persisted language.
- `@/common/config/i18n` — `DEFAULT_LANGUAGE`, `normalizeLanguageCode`, `mergeWithFallback`, `ensureAndSwitch`, `LocaleData`.
- `@renderer/services/i18n/locales/*` — the locale string bundles (shared with the renderer).

### External

- `i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
