<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# builtinMcp

## Purpose

Source for AionUi's built-in image-generation MCP server. `imageGenServer.ts` is the entry point bundled into a standalone `builtin-mcp-image-gen.js` artifact that the MCP client spawns as a separate `node` stdio process. `constants.ts` holds the server's identity strings and detection helpers shared by the rest of the app.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageGenServer.ts` | MCP server entry. Registers the `aionui_image_generation` tool via `@modelcontextprotocol/sdk`, reads provider config (`platform`, `base_url`, `api_key`, `model`, `proxy`) from `AIONUI_IMG_*` env vars, delegates to `executeImageGeneration` from `@/common/chat/imageGenCore`, and connects over `StdioServerTransport`. `main()` is called immediately with a fatal-error `process.exit(1)` handler. |
| `constants.ts`      | Exports `BUILTIN_IMAGE_GEN_ID`, `BUILTIN_IMAGE_GEN_NAME`, and `BUILTIN_IMAGE_GEN_LEGACY_NAMES`, plus `isBuiltinImageGenName()` / `isBuiltinImageGenTransport()` predicates used to recognize this built-in server by name or by its stdio transport (`node` + args containing `builtin-mcp-image-gen.js`).                                                                                                |

## For AI Agents

- Main-process code: no DOM APIs. This server actually runs as its OWN standalone Node process spawned via stdio, not inside the Electron main process — it must stay self-contained.
- `constants.ts` deliberately avoids importing from `common/config/storage` (only the `TProviderWithModel` type is imported in `imageGenServer.ts`) to prevent side effects when the server boots standalone. Keep new constants here local; do not add value-level imports that drag in app config.
- Config flows in ONLY through `AIONUI_IMG_*` environment variables — there is no IPC here. If config is missing, the tool returns an `isError: true` text result rather than throwing.
- The legacy-name list and transport detection exist for backward compatibility; update `BUILTIN_IMAGE_GEN_LEGACY_NAMES` and the `builtin-mcp-image-gen.js` arg check together if the bundle name changes.

## Dependencies

### Internal

- `@/common/chat/imageGenCore` (`executeImageGeneration`)
- `@/common/config/storage` (`TProviderWithModel` type only)

### External

- `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`)
- `zod` (tool input schema)

<!-- MANUAL: notes below this line are preserved on regeneration -->
