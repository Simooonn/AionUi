<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# navigation

## Purpose
Detects chrome-devtools MCP browser-navigation tool calls (`navigate_page`, `new_page`) emitted by any agent, extracts the target URL, and converts them into `preview_open` IPC messages so the renderer opens the page in the in-app preview panel instead of letting the agent navigate silently.

## Key Files
| File | Description |
| --- | --- |
| `NavigationInterceptor.ts` | All-static `NavigationInterceptor` class plus its constants/types. Handles tool-name normalization (strips `mcp__chrome-devtools__` style prefixes/suffixes), chrome-devtools identity matching, URL extraction from many shapes (`url`, `arguments`, `rawInput` (ACP), content-array text, title), and `intercept()` which returns an `InterceptionResult` carrying a built `preview_open` `IResponseMessage`. |
| `index.ts` | Barrel re-exporting `NavigationInterceptor`, the `NAVIGATION_TOOLS` / `CHROME_DEVTOOLS_IDENTIFIERS` / `MCP_PREFIXES` constants, and the `NavigationToolName` / `PreviewOpenData` / `NavigationToolData` / `InterceptionResult` types. |

## For AI Agents
- This is shared (`common`) code — no DOM and no Node.js-only APIs; keep it pure so both main and renderer can import it.
- `NavigationInterceptor` is entirely static with no instance state; call methods on the class (e.g. `NavigationInterceptor.intercept(data, conversation_id)`), do not instantiate.
- Interception requires BOTH a chrome-devtools identifier (in `server` or tool name) AND a normalized base name in `NAVIGATION_TOOLS`; when adding a new browser tool, update `NAVIGATION_TOOLS` and verify `normalizeToolName` strips its prefix form.
- `extractUrl` tries sources in a fixed priority order and only accepts `http://` / `https://` URLs; object extraction checks the field list `url/URL/uri/URI/href/target`.
- `createPreviewMessage` hardcodes `contentType: 'url'` and a default title `Browser: <url>`; `turn_id` is intentionally empty.

## Dependencies
### Internal
- `@/common/adapter/ipcBridge` (`IResponseMessage` type)
- `@/common/types/office/preview` (`PreviewContentType` type)
- `@/common/utils` (`uuid`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
