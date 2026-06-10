<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# api

## Purpose
Browser-side networking layer for the renderer to talk to the local aioncore server over HTTP and WebSocket. Provides a thin `fetch`-based HTTP client factory and a self-reconnecting WebSocket client with typed event dispatch and heartbeat keep-alive.

## Key Files
| File | Description |
| --- | --- |
| `client.ts` | `createApiClient(baseURL)` returns `{ get, put, post, patch, delete }`; each method is generic over the response type. Throws `ApiError(status, statusText, body)` on non-2xx; reads the error body once as text then attempts JSON parse. Returns `undefined` when the response is not JSON. |
| `ws.ts` | `createWebSocketClient(url, options?)` returns `{ on, send, close }`. Auto-reconnect with exponential backoff (default 1s→30s, infinite attempts), 30s heartbeat `ping`, JSON `{ event, payload }` envelope, and `on()` returns an unsubscribe fn. `close()` disables reconnect and clears all listeners. |
| `types.ts` | `ApiResponse<T>` envelope type: `success`, optional `data`/`error`, and `meta` pagination (`total`/`page`/`limit`). |
| `index.ts` | Barrel re-exporting `createApiClient`, `ApiError`, `createWebSocketClient`, and the `ApiResponse` type. |

## For AI Agents
- Renderer-only code: uses browser globals (`fetch`, `WebSocket`, `setTimeout`/`setInterval`) — never import Node.js modules here.
- No third-party HTTP/WS libraries; everything is built on native browser APIs. Keep it dependency-free.
- WebSocket reconnect backoff doubles per attempt and is capped by `maxReconnectDelayMs`; `reconnectAttempt` resets on a successful `open`. Malformed inbound messages are silently ignored.
- `send()` and the heartbeat both no-op unless `ws.readyState === WebSocket.OPEN` — outbound messages while disconnected are dropped, not queued.
- The HTTP error path reads the body exactly once (text first, then `JSON.parse`) to avoid double-consumption; preserve this when editing `request`.

## Dependencies
### External
Native browser APIs only (`fetch`, `WebSocket`); no npm packages imported.

<!-- MANUAL: notes below this line are preserved on regeneration -->
