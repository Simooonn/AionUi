<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# \_helpers

## Purpose

Shared test fixtures for the N3/N4 backend-migration unit tests. Provides an in-memory mock of `@/common/adapter/httpBridge` so domain tests can register fake HTTP routes and WS events without a real network or IPC layer.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mockHttpBridge.ts`      | `createMockHttpBridge()` factory returning a `MockHttpBridge`: register routes via `onGet`/`onPost`/`onPut`/`onPatch`/`onDelete` (Express-style `:param` patterns), inspect `calls`/`routeCount`/`wsListenerCount`, `emit()` WS payloads, and `reset()`. `asModule()` produces a drop-in object for `vi.mock('@/common/adapter/httpBridge', ...)` matching every named export (httpGet/Post/Put/Patch/Delete, stubProvider, withResponseMap, wsEmitter, wsMappedEmitter, stubEmitter, httpRequest, getBaseUrl, BackendHttpError, isBackendHttpError). Also exports `resetMockHttpBridge(mock)`. |
| `mockHttpBridge.test.ts` | Self-tests for the helper itself (T6 in the N3 checklist): route matching, `:param`/query parsing, body forwarding, unmatched `throw` vs `warn`, WS emit/unsubscribe, `withResponseMap`/`wsMappedEmitter`/`stubProvider` behavior, and `httpRequest` rejection.                                                                                                                                                                                                                                                                                                                                 |

## For AI Agents

- The public API of `mockHttpBridge.ts` is **frozen** (see header comment referencing `docs/backend-migration/plans/2026-05-08-n3-test-rewrite-adapter-common.md §2.1`). Do NOT change exported signatures; escalate to team-lead if a new capability is needed.
- Real `BackendHttpError`/`isBackendHttpError` are re-exported from source to preserve `instanceof` checks — keep them sourced from `@/common/adapter/httpBridge`, never reimplemented.
- Unmatched routes throw a verbose "unexpected call" error by default; pass `{ unmatched: 'warn' }` to get `console.warn` + `undefined` instead.
- `asModule().httpRequest` deliberately throws — tests must use the `httpGet`/`httpPost`/... factories, not direct `httpRequest`.
- This is test-only code (Vitest, Node env); not shipped in the desktop main or renderer bundles.

## Dependencies

### Internal

- `@/common/adapter/httpBridge` (types, `BackendHttpError`, `isBackendHttpError`)

### External

- `vitest` (`vi`, `describe`/`it`/`expect`/`beforeEach`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
