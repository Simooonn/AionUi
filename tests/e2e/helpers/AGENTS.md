<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# helpers

## Purpose
Reusable Playwright E2E helpers for the AionUi Electron app, barrel-exported via `index.ts`. They drive the real renderer UI (navigation, agent/conversation flows, assistant & team CRUD) and the `aioncore` backend (over the IPC bridge or direct HTTP), keeping individual spec files DRY.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Barrel re-exporting helpers from every module except `skillsHub.ts`, `teamConfig` types, and `httpBridge` (note: `httpBridge` and `teamConfig` ARE re-exported here). |
| `selectors.ts` | Centralised CSS/Arco/text selectors and selector-builder functions. App has few `data-testid`s; many selectors rely on Arco classes (`.arco-switch`, `.settings-sider__item`). |
| `navigation.ts` | `ROUTES` hash-route constants + `navigateTo`/`goToGuid`/`goToSettings` that click Sider/settings nav like a user (HashRouter + ProtectedLayout make programmatic nav unreliable). |
| `conversation.ts` | ACP conversation lifecycle via UI: `selectAgent`/`selectModel`, send-from-guid, wait for AI reply, delete. Polls through SWR re-renders. |
| `chatAionrs.ts` | aionrs (Aion CLI) conversation helpers; resolves binary via `which aionrs`, creates conversations via bridge, inspects conversation DB. Uses Node `fs`/`child_process`. |
| `skillsHub.ts` | Skills Hub helpers driving the backend over HTTP (`/api/skills/*`); also re-exports `invokeBridge`. NOT in the `index.ts` barrel — import directly. |
| `assistantSettings.ts` | Assistant settings page CRUD via `data-testid` selectors (cards, edit drawer, name/desc inputs, search/filter). |
| `teamHelpers.ts` | Team CRUD through the sidebar TeamCreateModal UI (keeps SWR cache in sync vs. raw HTTP POST). |
| `teamConfig.ts` | `TEAM_SUPPORTED_BACKENDS` set (`claude`/`codex`/`gemini`), filterable via `TEAM_AGENT` env var. |
| `extensions.ts` | `getExtensionSnapshot`/`getChannelPluginStatus` aggregating extension state via `invokeBridge`. |
| `permissions.ts` | Auto-approve / wait-for ACP permission cards (`message-permission-card`), prefers "always" options across i18n text. |
| `httpBridge.ts` | `httpInvoke`/`httpGet`/`httpPost`/`httpDelete` run `fetch` inside `page.evaluate` against `window.__backendPort` (default 13400), unwrapping `{ data }`. |
| `assertions.ts` | `expectBodyContainsAny` (i18n-agnostic), `expectUrlContains`, `createErrorCollector` (filters ResizeObserver/`net::ERR_`). |
| `screenshots.ts` | `takeScreenshot` saving under `tests/e2e/screenshots/`. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `bridge` | IPC `invokeBridge` helper used by extensions/team/aionrs helpers (see `bridge/AGENTS.md`). |

## For AI Agents
- These run in the Playwright/Node test process, not in renderer or main. `chatAionrs.ts` and `screenshots.ts` use Node `fs`/`path`/`child_process` directly; browser-context code must live inside `page.evaluate` (see `httpBridge.ts`).
- Two backend-call styles coexist: `invokeBridge` (IPC) and HTTP (`httpBridge.ts` / `skillsHub.ts`). The renderer migrated several flows IPC→HTTP; match the helper to the route's current adapter.
- Prefer the UI-flow helpers over raw HTTP for team/assistant creation so SWR sidebar caches stay synced (documented gotcha in `teamHelpers.ts`).
- When adding a selector, put it in `selectors.ts` (single source of truth) and export through `index.ts`; remember `skillsHub.ts` is intentionally outside the barrel.
- All `expect`/fixtures come from `../fixtures`, not directly from `@playwright/test` (except bare types).

## Dependencies
### Internal
`../fixtures` (custom `expect`/test); `./bridge`; sibling helpers cross-import (`navigation` ← `selectors`, `conversation` ← `navigation`/`selectors`).
### External
`@playwright/test` (types + Page/Locator); Node builtins `fs`, `path`, `os`, `child_process` in `chatAionrs.ts`/`skillsHub.ts`/`screenshots.ts`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
