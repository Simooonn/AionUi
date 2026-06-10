<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# common-adapter

## Purpose
Vitest unit tests for the shared adapter layer in `@/common/adapter` — the mapper functions that translate backend API payloads (snake_case, `provider_id`/`model`) into frontend types and the browser/HTTP/WebSocket bridge. Guards the snake_case → camelCase boundary and realtime-error handling against regressions.

## Key Files
| File | Description |
| --- | --- |
| `apiModelMapper.test.ts` | Tests `toApiModel`, `toApiModelOptional`, `fromApiModel`, `fromApiConversation`, `fromApiPaginatedConversations`. Covers `provider_id`/`model` ↔ `TProviderWithModel` mapping, `use_model` fallback, null/non-object passthrough, and `custom_workspace` inference from `workspace` + `is_temporary_workspace`. |
| `searchMapper.test.ts` | Tests `fromApiSearchResult` over `PaginatedResult<ApiMessageSearchItem>`: preserves `total`/`has_more`, maps conversation `model`, handles null/missing model, and applies `fromApiConversation` (custom_workspace) per item. |
| `fileSnapshotMapper.test.ts` | Regression test for `fromBackendCompareResult`: maps `relative_path` → `relativePath` on `/api/fs/snapshot/compare` staged/unstaged entries, preserves `file_path`/`operation`, defaults missing arrays to `[]`, and ensures the snake_case field does not leak. |
| `workspaceMapper.test.ts` | Tests `fromBackendWorkspaceFlatFiles`: `full_path`/`relative_path` → `fullPath`/`relativePath` and asserts snake_case keys are dropped. |
| `httpBridge.test.ts` | Tests `getBaseUrl` port resolution (`window.__backendPort` > `globalThis.__backendPort` > `127.0.0.1:13400` fallback, WebUI empty-string mode) plus the http verb helpers, `BackendHttpError`, `wsEmitter`/`wsMappedEmitter`, and stub utilities. Runs under `@vitest-environment node`. |
| `browserRealtimeError.test.ts` | Integration-style test of `@/common/adapter/browser`: mocks `@office-ai/platform` and a `FakeWebSocket`, asserts terminal auth errors (`REALTIME_AUTH_MISSING`/`EXPIRED`) close the socket and redirect to `/login`, while non-auth/recoverable errors emit and reconnect without redirect. |

## For AI Agents
- These tests target shared `common` code, so they assert plain data transforms — no DOM/Node-specific mapper logic. The two bridge tests (`httpBridge`, `browserRealtimeError`) explicitly opt into `@vitest-environment node` and stub `window`/`WebSocket`/`globalThis.__backendPort` themselves.
- `browserRealtimeError.test.ts` uses `vi.hoisted` to mock `@office-ai/platform.bridge.adapter`/`logger`, `vi.resetModules` + dynamic `import` to reload the adapter per case, and fake timers to drive reconnect/redirect delays — preserve this reload-per-test pattern when adding cases.
- The recurring assertion across mappers: the emitted object must NOT carry the original snake_case key (e.g. `(file as Record<string, unknown>).relative_path` is `undefined`). Keep that negative check when extending mapper tests.
- `fromApiModel`/`fromApiConversation` fill empty provider fields (`platform`/`name`/`base_url`/`api_key` → `''`) and prefer `use_model` over `model`; match these exact shapes in `toEqual`.

## Dependencies
### Internal
`@/common/adapter` (apiModelMapper, searchMapper, fileSnapshotMapper, workspaceMapper, httpBridge, browser), `@/common/adapter/ipcBridge` (`PaginatedResult`), `@/common/config/storage` (`TProviderWithModel`).
### External
`vitest`, `@office-ai/platform` (mocked).

<!-- MANUAL: notes below this line are preserved on regeneration -->
