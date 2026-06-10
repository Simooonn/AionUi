<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# services

## Purpose
Network/transport layer for the React Native mobile app that connects to a running AionUi desktop server. Provides the raw WebSocket connection manager, a request/response `bridge` built on the desktop's subscribe protocol, an axios HTTP client, and an in-memory handoff for initial conversation messages.

## Key Files
| File | Description |
| --- | --- |
| `websocket.ts` | `WebSocketService` class + `wsService` singleton. JSON `{ name, data }` framing mirroring `src/adapter/browser.ts`: ping/pong heartbeat, exponential-backoff reconnect (500ms→8s), dead-connection check (no ping for 50s), message queue/flush, token passed via `Sec-WebSocket-Protocol`. Handles `auth-expired` and close code 1008 via an auth-challenge handler; checks JWT `exp` before connecting. |
| `bridge.ts` | `BridgeService` + `bridge` singleton. Wraps `wsService` with the `@office-ai/platform` subscribe protocol: `request()` sends `subscribe-{name}` and awaits `subscribe.callback-{name}{id}` (30s default timeout); also `emit()` (fire-and-forget), `on()`/`once()` for server-push events. |
| `api.ts` | Axios instance `api` plus `configureApi`/`resetApi`/`getBaseURL`/`getAuthToken` and `refreshToken()` (POST `/api/auth/refresh`). Sets `baseURL` to `http://{host}:{port}` and a `Bearer` auth header. |
| `pendingInitialMessages.ts` | Module-level `Map` to pass a conversation's first message from creation to the mounted ChatContext via `setPendingInitialMessage`/`consumePendingInitialMessage` (consume deletes). Analogous to desktop's sessionStorage approach. |

## For AI Agents
- React Native environment: use RN's global `WebSocket` (already used here) — no Node `ws`, no DOM-only APIs. `WebSocketMessageEvent`/`WebSocketCloseEvent` are RN-typed events.
- `wsService` and `bridge` are module singletons; the bridge's constructor registers itself as the single `wsService.onMessage` handler, so do not call `wsService.onMessage` elsewhere or you will override the bridge.
- Request IDs are generated as `m_{Date.now()}_{counter}`; the callback name must exactly match `subscribe.callback-{name}{id}` or `request()` will hang until timeout.
- `send()` auto-queues and triggers `connect()` when the socket is closed; keep this lazy-connect behavior intact.
- Keep the protocol byte-compatible with the desktop server (`src/adapter/browser.ts` and `@office-ai/platform`) when editing framing or names.

## Dependencies
### Internal
- `../utils/jwt` (`decodeJwtPayload`) for token-expiry checks in `websocket.ts`.
### External
- `axios` (HTTP client in `api.ts`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
