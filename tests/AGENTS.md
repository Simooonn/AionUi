<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tests

## Purpose
Root of the Vitest test suite for the AionUi desktop app. Holds the two global setup files consumed by the `vitest.config.ts` projects (one Node, one jsdom), plus the unit/integration/e2e test trees and shared fixtures.

## Key Files
| File | Description |
| ---- | ----------- |
| `vitest.setup.ts` | Setup for the **node** environment project. Registers `NodePlatformServices` via `registerPlatformServices()` so code calling `getPlatformServices()` works, and stubs a global/window `electronAPI` (emit/on + window controls). |
| `vitest.dom.setup.ts` | Setup for the **jsdom** environment project (React component/hook tests). Imports `@testing-library/jest-dom/vitest`, mocks `electronAPI`, `ResizeObserver` (for Virtuoso), `IntersectionObserver`, `requestAnimationFrame`, `scrollTo`/`scrollIntoView`, and a `localStorage` fallback. |

## Subdirectories
| Directory | Purpose |
| --------- | ------- |
| `unit` | Unit tests, largest tree (mirrors source modules) (see `unit/AGENTS.md`). |
| `integration` | Cross-module / IPC integration tests (see `integration/AGENTS.md`). |
| `e2e` | End-to-end tests driving the app (see `e2e/AGENTS.md`). |
| `fixtures` | Test data: `fake-acp-cli/`, `fake-extension/`, and `fake-extension.zip` used as inputs by extension/ACP tests. |

## For AI Agents
- These setup files run in BOTH process worlds depending on the project: `vitest.setup.ts` is Node (use `@/common/platform` services, no DOM), `vitest.dom.setup.ts` is jsdom (DOM mocks, no real Electron/Node). Add new global mocks to the matching file — don't merge them.
- `vitest.dom.setup.ts` is strictly typed (declares an `ElectronAPI` interface); `vitest.setup.ts` intentionally uses `any` with eslint-disable for the global. Match the existing style of the file you edit.
- When a component test fails on a missing browser API (observers, RAF, scroll, localStorage), extend the mocks here rather than per-test.
- Setup wiring lives in the repo-root `vitest.config.ts` (`setupFiles` per project) — changing a setup file's path or name requires updating that config.

## Dependencies
### Internal
- `@/common/platform` (`registerPlatformServices`, `NodePlatformServices`)
### External
- `vitest`, `@testing-library/jest-dom`

<!-- MANUAL: notes below this line are preserved on regeneration -->
