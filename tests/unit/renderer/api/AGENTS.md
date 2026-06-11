<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# api

## Purpose

Vitest unit tests for the renderer HTTP client at `@renderer/api/client` (`createApiClient`, `ApiError`). Covers error-body parsing (JSON vs raw text), the success path, and the #3249 regression where a non-JSON error response double-consumed the fetch body stream.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.test.ts` | Stubs global `fetch` with `vi.stubGlobal` and asserts that `ApiError.status`/`ApiError.body` are populated correctly: JSON errors parse into an object, non-JSON errors capture raw text (no "body stream already read"), empty bodies fall back to `''`, 200 JSON returns parsed data, and 204/non-JSON returns `undefined`. |

## For AI Agents

- Runs under `@vitest-environment node` (declared in the file docblock), not jsdom — there is no DOM; the `Response` global comes from Node/undici.
- `fetch` is mocked per-test with `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(...)))`; `beforeEach`/`afterEach` call `vi.clearAllMocks()` and `vi.unstubAllGlobals()`, so add new cases inside the existing `describe` blocks rather than introducing standalone global stubs.
- The non-JSON case is a regression guard for #3249 — the response body must be read exactly once. If you change `client.ts` body handling, keep this assertion (`err.body` equals the raw text) passing.
- Import the client via the `@renderer/*` path alias; do not use relative paths into `packages/desktop/src/renderer`.

## Dependencies

### Internal

- `@renderer/api/client` — the system under test (`createApiClient`, `ApiError`).

### External

- `vitest` — `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
