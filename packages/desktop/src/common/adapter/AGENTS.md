<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# adapter

## Purpose
The cross-process communication layer between the renderer and the aioncore backend. `ipcBridge.ts` defines every namespaced bridge endpoint (conversation, fs, team, mcp, runtime, update, etc.); `httpBridge.ts` provides the HTTP-REST + WebSocket transport that replaces the legacy IPC bridge, while `main.ts` / `browser.ts` wire `@office-ai/platform`'s `bridge.adapter` to Electron IPC, WebSocket, or WebUI same-origin transport. The `*Mapper.ts` files translate snake_case backend payloads into the camelCase frontend types.

## Key Files
| File | Description |
| --- | --- |
| `ipcBridge.ts` | Master bridge surface (~1300+ lines). Exports namespaced objects (`conversation`, `fs`, `team`, `mcp`, `runtime`, `application`, `update`, `dialog`, `database`, `webui`, `cron`, …) built from the HTTP/WS factories. Single source of bridge call definitions. |
| `httpBridge.ts` | Transport factory: `httpGet/Post/Put/Patch/Delete`, `withResponseMap`, `wsEmitter`, `wsMappedEmitter`, `stubProvider/stubEmitter`. Resolves backend port/base URL, unwraps `{ success, data }`, throws `BackendHttpError` (with `isBackendHttpError`), redacts secrets in logs, manages a reconnecting WS singleton. |
| `main.ts` | Main-process `bridge.adapter`: serializes events, enforces a 50 MB IPC payload cap, fans events out to every `BrowserWindow` and to WS clients; `initMainAdapterWithWindow`, `setPetNotifyHook`. |
| `browser.ts` | Renderer-side `bridge.adapter`: uses Electron IPC when `window.electronAPI` exists, otherwise a reconnecting WebSocket (`/ws`) with message queue, ping/pong, and auth-expiry → `/login` redirect. |
| `registry.ts` | Electron-free shared registry: WebSocket broadcaster list (`registerWebSocketBroadcaster`, `broadcastToAll`) and the bridge emitter ref (`get/setBridgeEmitter`). |
| `constant.ts` | Bridge event keys: `ADAPTER_BRIDGE_EVENT_KEY`, `SHOW_OPEN_REQUEST_EVENT`. |
| `apiModelMapper.ts` | Maps `TProviderWithModel` ↔ API `{ provider_id, model }`; `fromApiConversation` derives `custom_workspace` from `extra`. |
| `teamMapper.ts` | Backend ↔ frontend team/agent mapping; role/status/workspace-mode normalization, ACP-vs-native backend resolution. |
| `searchMapper.ts` | Maps backend `ApiMessageSearchItem` paginated results to `IMessageSearchItem`. |
| `workspaceMapper.ts` | Path helpers + backend fs-entry / flat-file list mapping to `IDirOrFile` / `IWorkspaceFlatFile`. |
| `fileSnapshotMapper.ts` | Maps backend `relative_path` → `relativePath` for file-snapshot `CompareResult` (fixes a 400 baseline bug). |

## For AI Agents
- `main.ts` is main-process only (imports `electron`); `browser.ts` is renderer only (uses `window`/`WebSocket`/`document`). Never import one from the other — `registry.ts` is the Electron-free shared piece used by both.
- New backend endpoints go in `ipcBridge.ts` via the `httpBridge` factories (`httpGet`, `httpPost`, …); attach a `*Mapper` through `withResponseMap` when the backend uses snake_case. Do not hand-write `fetch`.
- Backend responses are auto-unwrapped from `{ success, data }`; non-2xx throws `BackendHttpError` — branch on `error.code` via `isBackendHttpError`, not on message text.
- Payloads over 50 MB are dropped in `main.ts` and reported as a `bridge:error` event; keep large data out of bridge events.
- Use `stubProvider`/`stubEmitter` for endpoints the backend has not implemented yet (they warn and return a default).

## Dependencies
### Internal
`@/common/config/*` (storage types, constants), `@/common/types/*` (platform, team, agent, provider, office), `@/common/chat/*`, `@/common/update`, `@/common/theme`.
### External
`@office-ai/platform` (`bridge`, `logger`), `electron` (main process: `ipcMain`, `BrowserWindow`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
