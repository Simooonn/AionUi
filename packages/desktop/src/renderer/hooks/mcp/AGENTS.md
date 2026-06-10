<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# mcp

## Purpose
Renderer-side React hooks and helpers for managing MCP (Model Context Protocol) servers in the Settings UI: loading the server catalog, CRUD operations, connection testing, OAuth auth flows, and modal state. All persistence and protocol work is delegated to the main process over `mcpService` IPC.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Barrel re-exporting the five `useMcp*` hooks. |
| `useMcpServers.ts` | Source-of-truth hook: loads catalog via `ensureBackendMcpCatalog`, loads extension-contributed servers via `ipcBridge.extensions.getMcpServers`, exposes `mcpServers`, `allMcpServers`, and a `saveMcpServers` updater that persists to `configService('mcp.config')`. |
| `catalog.ts` | Non-hook helpers: `ensureBackendMcpCatalog` (merges backend user servers + builtin servers, migrates legacy local servers via `importServers`), `toBackendMcpPayload`, `toSessionMcpServer`, server dedupe/normalization. Maps `streamable_http` transport to backend `http`. |
| `useMcpServerCRUD.ts` | Add / batch-import / edit / delete handlers; wraps `mcpService.createServer/updateServer/deleteServer/importServers/toggleServer`, merges persisted + UI state, shows Arco `Message` toasts. |
| `useMcpConnection.ts` | Connection-test hook: `handleTestMcpConnection(s)` with bounded concurrency; maps backend MCP error codes (`MCP_COMMAND_NOT_FOUND`, `MCP_TIMEOUT`, etc.) to i18n messages; tracks `testingServers`; fires `onAuthRequired`/`onAuthResolved` callbacks. |
| `useMcpOAuth.ts` | OAuth status/login/logout hook for URL-based transports (`http`/`sse`/`streamable_http`); tracks per-server `oauthStatus` and `loggingIn`; exposes `markLoginRequired`/`clearLoginRequired`. |
| `useMcpModal.ts` | Local modal/UI state (add/edit modal, delete-confirm, per-server collapse). |
| `messageQueue.ts` | Singleton `globalMessageQueue` that serializes Arco toasts with a 100ms gap (max 50 queued) to prevent overlap during rapid/batch MCP ops. |

## For AI Agents
- Renderer-only — no Node.js APIs. All server persistence and protocol calls go through `mcpService` (`@/common/adapter/ipcBridge`) or `httpRequest`/`isBackendHttpError` (`@/common/adapter/httpBridge`); never read disk or spawn processes here.
- `useMcpServers` is the single owner of `mcpServers` state and the `saveMcpServers` updater; CRUD/connection hooks receive `setMcpServers`/`saveMcpServers` as params rather than managing their own copy.
- Builtin servers are kept ahead of user servers via `replaceUserServer`; preserve that ordering and the builtin/user dedupe keys in `catalog.ts` when editing list logic.
- Route all user-facing toasts through `globalMessageQueue.add(...)` (in `useMcpConnection`) to avoid Arco render collisions; all strings use `t('settings.mcp*')` i18n keys.
- Comments are bilingual (CN/EN) in existing files; keep new comments in English per project convention but match local style where present.

## Dependencies
### Internal
- `@/common/adapter/ipcBridge` (`mcpService`, `ipcBridge.extensions`), `@/common/adapter/httpBridge`, `@/common/config/configService`, `@/common/config/storage` types (`IMcpServer`, `IMcpServerTransport`, `ISessionMcpServer`).
### External
- `react`, `react-i18next`, `i18next` (`TFunction`), `@arco-design/web-react` (`Message`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
