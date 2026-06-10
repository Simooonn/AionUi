<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# mobile

## Purpose
The AionUi React Native mobile app (Expo + expo-router), a separate workspace from the Electron desktop app. It reuses pure functions from the desktop project's `src/common` via Metro path aliasing and ships to iOS/Android via EAS.

## Key Files
| File | Description |
| --- | --- |
| `package.json` | Expo 55 / React Native 0.83 / React 19 app named `aionui-mobile`. Entry is `expo-router/entry`. Scripts: `start`, `ios`/`android` runs, `prebuild`, `test` (jest), and `build:*` wrappers calling `scripts/build.js`. |
| `app.config.ts` | Dynamic Expo config. Pulls version/buildNumber from `versions/version.json`; bundle id `ai.resopod.aionui`; enables `expo-router`, `expo-secure-store`, `expo-dev-client`, `expo-camera` plugins and typed routes. Declares camera usage for QR-code server login. |
| `metro.config.js` | Watches `../src/common` to share desktop pure functions; aliases `@common` to it. Blocks platform-specific modules from RN: `src/common/storage.ts`, `src/common/slash/`, and `@office-ai/platform`. |
| `eas.json` | EAS build/submit profiles: `development` (dev client, internal), `preview` (internal/store, APK), `production` (APK). iOS submit credentials under `submit`. |
| `tsconfig.json` | Extends `expo/tsconfig.base`, strict mode, `@/*` aliased to project root. |
| `jest.config.ts` | `jest-expo` preset; tests in `__tests__/**/*.test.ts(x)`; `@/*` mapped to root; coverage from `src/utils` and `src/services`. |
| `jest.setup.ts` | Global mocks for `expo-secure-store`, `expo-localization`, and `@react-native-async-storage/async-storage`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `app` | expo-router file-based route screens (see `app/AGENTS.md`). |
| `src` | App source: utils, services, components, i18n, etc. (see `src/AGENTS.md`). |
| `scripts` | Build helper scripts invoked by `package.json` (see `scripts/AGENTS.md`). |
| `__tests__` | Jest unit tests for utils/services (see `__tests__/AGENTS.md`). |
| `assets` | App images (icon, splash) under `images/`. |
| `versions` | `version.json` holding `version`/`buildNumber` consumed by `app.config.ts`. |

## For AI Agents
- This is React Native, not the Electron renderer: no DOM, no `@arco-design/web-react`, no UnoCSS. Use React Native primitives and the deps in `package.json` (`@react-navigation/*`, `@shopify/flash-list`, `react-native-markdown-display`, `react-native-svg`, etc.).
- Routing is file-based via expo-router under `app/`; typed routes are enabled (`experiments.typedRoutes`).
- Sharing desktop code: only import from `src/common` through the `@common` alias, and never pull in the Metro-blocked modules (`storage.ts`, `slash/`, `@office-ai/platform`) — they rely on desktop-only platform APIs.
- Bump app versions in `versions/version.json`, not `app.config.ts`.
- This workspace uses its own `node_modules` (Bun lockfile `bun.lock`) and Jest (not Vitest like the desktop app).

## Dependencies
### Internal
- `../src/common` (shared pure functions via the `@common` alias).
### External
- `expo`, `expo-router`, `expo-secure-store`, `expo-camera`, `expo-localization`; `react-native`, `@react-navigation/*`; `i18next`/`react-i18next`; `axios`; `jest` + `jest-expo` + `@testing-library/react-native`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
