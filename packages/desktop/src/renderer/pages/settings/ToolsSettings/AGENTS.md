<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# ToolsSettings

## Purpose
Renderer UI for the MCP (Model Context Protocol) tools section of the Settings page. Renders the collapsible list of configured MCP servers, their connection/OAuth status, per-server tool listings, and the add/import/edit/delete flows. Also holds the pure JSON-parsing helper used when importing MCP server definitions.

## Key Files
| File | Description |
| --- | --- |
| `McpManagement.tsx` | Top-level section component. Wires the `useMcp*` hooks (servers, connection testing, OAuth, modal state, CRUD) and wraps add/edit/batch-import handlers to auto-run connection tests. Renders the `Collapse.Item` header with an add-server `Button`/`Dropdown` (JSON vs one-click import based on detected agents), the server list, `AddMcpServerModal`, and the delete-confirm `Modal`. Hides the builtin image-gen server. |
| `McpServerItem.tsx` | Per-server `Collapse` wrapper; composes `McpServerHeader` (header) and `McpServerToolsList` (body). Passes through collapse/test/OAuth/edit/delete callbacks and the `isReadOnly` flag. |
| `McpServerHeader.tsx` | Server row header: name, status icon/text (`getStatusIcon`/`getStatusText` from `last_test_status` + OAuth state), `Popover`/`Tooltip` status detail, `FeedbackButton` on error, OAuth login button, test-connection refresh, and edit/delete `Dropdown` (hidden for builtin/read-only servers). |
| `McpServerToolsList.tsx` | Renders `server.tools` as name + truncated description rows; returns null when there are no tools. |
| `mcpJsonImport.ts` | Pure parser `parseMcpJsonImport(config)` returning a discriminated `McpJsonImportResult`. Handles `mcpServers` object/array/bare-server shapes and normalizes stdio vs http/sse `IMcpServerTransport`; errors are returned as i18n `errorKey`s, not thrown. |

## For AI Agents
- Renderer-only code (no Node.js APIs). All server state mutations and connection tests go through the `@/renderer/hooks/mcp` hooks, not direct IPC; do not bypass them.
- `mcpJsonImport.ts` is pure and side-effect free (no i18n, no React) — it returns `errorKey` strings for the caller to translate. Keep it that way and add new error cases to the `McpJsonImportErrorKey` union.
- Builtin servers (`server.builtin`) and extension servers (`isReadOnly`) suppress edit/delete UI; the builtin image-gen server is filtered out entirely via `isVisibleMcpServer`. Preserve these guards when changing the list.
- OAuth applies only to `http`/`sse`/`streamable_http` transports (see `isOAuthCapableServer`/`supportsOAuth`); status checks run in an effect on the server list.
- Status icons use `iconColors` tokens from `@/renderer/styles/colors`; all user-facing text uses `react-i18next` `t('settings.*')` keys — no hardcoded strings.

## Dependencies
### Internal
`@/common/config/storage` (`IMcpServer`, `IMcpServerTransport`, builtin image-gen constants), `@/renderer/hooks/mcp` and `useMcpOAuth`, `@/renderer/hooks/agent/useAgents`, `../components/AddMcpServerModal`, `@/renderer/components/base/FeedbackButton`, `@/renderer/styles/colors`.
### External
`@arco-design/web-react` (Collapse, Dropdown, Menu, Modal, Button, Popover, Tooltip), `@icon-park/react`, `react`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
