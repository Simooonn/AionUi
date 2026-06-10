<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# services

## Purpose
Jest unit tests for the React Native mobile app's service layer under `mobile/src/services` (imported via the `@/src/services/*` alias). Covers HTTP API configuration, the WebSocket transport, and the event/request bridge built on top of it.

## Key Files
| File | Description |
| --- | --- |
| `api.test.ts` | Tests `configureApi`/`resetApi` and the `getBaseURL`/`getAuthToken` accessors: building `http://host:port` baseURL and the `Authorization: Bearer <token>` header on the shared axios `api` instance, plus reset clearing both. |
| `websocket.test.ts` | Tests `WebSocketService` end to end using an in-file `MockWebSocket` assigned to `globalThis.WebSocket`: connect URL + token subprotocol, state transitions, message routing, ping/pong, auth failure (close 1008 / `auth-expired`), exponential-backoff reconnection (500ms → 8s cap), send queue flushing on open, and `disconnect`/`reconnect`. |
| `bridge.test.ts` | Tests the `bridge` singleton with `wsService` jest-mocked: `emit` fire-and-forget sends, `on`/`once` subscription + unsubscribe, and `request` resolving on a matching reply, rejecting on timeout, and cleaning up its listener. |

## For AI Agents
- Mobile (React Native) tests run under **Jest**, not the desktop project's Vitest. Use `jest.fn()`/`jest.mock()`/`jest.useFakeTimers()` here, not Vitest APIs.
- `bridge.test.ts` must keep the `jest.mock('@/src/services/websocket', ...)` call at the very top (before imports are used) so the mock is hoisted; the bridge wires its handler via `wsService.onMessage`, which the test recovers from `mockOnMessage.mock.calls[0][0]`.
- `websocket.test.ts` installs a global `MockWebSocket` and tracks every constructed instance in `mockWSInstances`; reconnection assertions rely on overriding each instance's `close` to a plain `jest.fn()` so simulated closes don't recurse into `onclose`. Backoff timing assertions are tightly coupled to the 500ms base / 8s cap schedule.
- Tests assert against real exports from `mobile/src/services` (e.g. `api.defaults`, `service.state`); changing those service signatures requires updating these specs.

## Dependencies
### Internal
- `@/src/services/api`, `@/src/services/websocket`, `@/src/services/bridge` (the mobile services under test).
### External
- `jest` (test runner, mocks, fake timers); `axios` indirectly via the `api` instance under test.

<!-- MANUAL: notes below this line are preserved on regeneration -->
