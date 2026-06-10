<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# i18n

## Purpose
Internationalization setup for the React Native mobile app. Configures `i18next` + `react-i18next`, detects the device language via `expo-localization`, and persists the user's language choice in `AsyncStorage`.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Builds the `resources` map from locale JSON, exposes `initI18n()` (async init with `fallbackLng: 'en-US'`, Suspense off), `changeLanguage(lang)`, `getLanguagePreference()`, and the default `i18n` instance. Stores preference under `AsyncStorage` key `aionui_language`; the sentinel `'system'` falls back to `detectDeviceLanguage()`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `locales` | Translation JSON resources: `en-US.json`, `zh-CN.json`, `ru-RU.json`, `uk-UA.json` (flat/nested key → string maps). |

## For AI Agents
- React Native context only — no DOM and no Electron/Node desktop APIs here. Use `AsyncStorage` (not `localStorage`) and `expo-localization` (not `navigator.language`).
- `detectDeviceLanguage()` maps device locale prefixes: `zh*` → `zh-CN`, `ru*` → `ru-RU`, else `en-US`. There is no Ukrainian mapping.
- Gotcha: `index.ts` only imports/registers `en-US`, `zh-CN`, and `ru-RU` in `resources`. `locales/uk-UA.json` exists on disk but is NOT wired up — add an import and a `resources` entry (and a `detectDeviceLanguage` branch) to enable it.
- When adding a language, update all three: the `import`, the `resources` object, and the locale prefix check.
- All keys must exist in `en-US.json` since it is the fallback language.

## Dependencies
### External
`i18next`, `react-i18next`, `expo-localization`, `@react-native-async-storage/async-storage`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
