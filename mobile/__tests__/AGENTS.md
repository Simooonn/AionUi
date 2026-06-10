<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# __tests__

## Purpose
Jest test suites for the AionUi React Native mobile app. Tests live here under category subdirectories and cover the mobile app's service layer (API, WebSocket, bridge) and utility helpers. Driven by `mobile/jest.config.ts` (`jest-expo` preset, `testMatch` `<rootDir>/__tests__/**/*.test.ts?(x)`).

## Subdirectories
| Directory | Purpose |
| --- | --- |
| services | Tests for the mobile service layer — `api.test.ts`, `bridge.test.ts`, `websocket.test.ts` (see `services/AGENTS.md`) |
| utils | Tests for mobile utility helpers — `groupingHelpers`, `messageAdapter`, `uuid`, `workspace` (see `utils/AGENTS.md`) |

## For AI Agents
- This is React Native (mobile/), not the Electron desktop app — do NOT import desktop process/renderer/preload modules here.
- Test files end in `.test.ts(x)` and import app code via the `@/` alias, which jest maps to `mobile/`'s root (`'^@/(.*)$': '<rootDir>/$1'`).
- Coverage is collected only from `src/utils/**` and `src/services/**`; new tests for those areas count toward coverage.
- Shared test setup runs from `mobile/jest.setup.ts` (`setupFilesAfterEnv`).
- Mirror the source directory layout: put service tests in `services/`, util tests in `utils/`.

## Dependencies
### Internal
- `mobile/src/services/*` and `mobile/src/utils/*` (subjects under test, via `@/` alias)
### External
- `jest`, `jest-expo`

<!-- MANUAL: notes below this line are preserved on regeneration -->
