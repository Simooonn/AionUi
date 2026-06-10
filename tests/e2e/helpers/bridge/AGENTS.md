<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# bridge

## Purpose
E2E test helper for invoking AionUi backend providers from Playwright renderer context. `invokeBridge(page, key, data)` maps a legacy dotted IPC key to an aioncore HTTP route and issues a `fetch` against `window.__backendPort`; unknown keys fall back to the legacy `@office-ai/platform` `subscribe`/`callback` IPC protocol.

## Key Files
| File | Description |
| --- | --- |
| `invoke.ts` | Exports `invokeBridge<T>`. Resolves `HTTP_ROUTES[key]`, builds method/path/body, runs `page.evaluate` to fetch `http://127.0.0.1:{__backendPort}{path}`, unwraps `{ data }` envelopes, applies the route's response mapper. Legacy fallback uses `electronAPI.emit('subscribe-{key}', { id, data })` → `on('subscribe.callback-{key}{id}')` with a timeout (default 10s). |
| `routes.ts` | `HTTP_ROUTES` map (legacy key → `HttpRoute`) plus the `HttpRoute` type. Covers cron, team, database, `fs.*`, `fs.snapshot.*`, office preview (word/excel/ppt), `document.convert`, `preview-history.*`. `path` may be a function over params; `mapBody` reshapes request body; `mapResponse` names a mapper. |
| `mappers.ts` | `RESPONSE_MAPPERS` keyed by `ResponseMapperKey`. Translates aioncore snake_case DTOs (`full_path`, `is_dir`, `content_type`, `new_path`) to the camelCase shapes legacy IPC exposed, so test assertions stay idiomatic. Recurses into dir/file trees, snapshot compare staged/unstaged, preview snapshot info/content. |

## For AI Agents
- `invoke.ts` runs in Node test context but the inner `fetch` executes in the browser via `page.evaluate`; do NOT close over Node-only values inside the evaluated callback — pass everything through the second arg object.
- `GET`/`DELETE` routes never send a body; the renderer fetch only sets `Content-Type` and a JSON body when `requestBody !== undefined` and method is not `GET`.
- When adding a backend route used by a new E2E test, add an entry to `HTTP_ROUTES`. If the response uses snake_case fields the test asserts in camelCase, add a `ResponseMapperKey` + mapper in `mappers.ts` and reference it via `mapResponse`. Keep mappers as plain Node helpers (not evaluated strings) so they stay unit-testable.
- Backend routes assume aioncore `--local` mode (no auth). Response envelopes may be either `{ success, data }` or a bare value — `invoke.ts` unwraps `data` only when present.

## Dependencies
### External
`@playwright/test` (`Page` type).

<!-- MANUAL: notes below this line are preserved on regeneration -->
