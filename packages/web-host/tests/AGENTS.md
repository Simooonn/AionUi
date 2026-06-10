<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tests

## Purpose
Vitest test suite for the `web-host` package — the Node-side host that boots the backend launcher and static server and exposes `startWebHost`. Covers the orchestration entry point and provides reusable fixtures for HTTP-level mocking.

## Key Files
| File | Description |
| --- | --- |
| `start-web-host.test.ts` | Tests `startWebHost` (from `../src/index.js`) as a thin orchestrator: `vi.doMock`s `../src/backend-launcher.js` and `../src/static-server.js`, asserts the returned handle has `port`/`backendPort` and no `initialPassword`, and that `handle.stop()` cleans up. Includes `test.todo` placeholders for port-conflict and cleanup-ordering cases. |
| `equivalence.test.ts` | Pointer/placeholder only — the real equivalence test was removed during the N2 legacy-test cleanup. Holds a single intentional no-op `it` so `bun test equivalence` still resolves. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `fixtures` | Test doubles: `mock-backend.ts` (a `node:http` server standing in for aioncore that returns canned responses for endpoints like `/api/ping` and records every request for assertions) and a `renderer/` subfolder. |

## For AI Agents
- This is a Node/main-side package — tests run under Vitest with full Node APIs (`node:http`, `node:net`); no DOM environment.
- Source modules are imported with explicit `.js` extensions (`../src/index.js`) and mocked via `vi.doMock` + dynamic `import()` inside each test; always pair `vi.doMock` with `vi.doUnmock` and reset via `vi.clearAllMocks()` in `beforeEach`.
- `startWebHost` carries no credentials/config-file logic post-M6: admin password flows through the backend's `/api/webui/reset-password`, not this handle — do not reintroduce `initialPassword` assertions.
- `equivalence.test.ts` is deliberately empty; recreate real coverage under a new `tests/unit/` layout rather than refilling this placeholder.

## Dependencies
### Internal
- `../src/index.js`, `../src/backend-launcher.js`, `../src/static-server.js`
### External
- `vitest`, `node:http`, `node:net`

<!-- MANUAL: notes below this line are preserved on regeneration -->
