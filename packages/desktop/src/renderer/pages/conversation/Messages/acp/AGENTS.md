<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# acp

## Purpose

Renderer message components for the ACP (Agent Client Protocol) conversation flow. Each component renders one ACP-specific message variant: a permission prompt the user must confirm, a tool-call progress card (with diff/markdown output), and the agent's list of available slash commands.

## Key Files

| File                           | Description                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MessageAcpPermission.tsx`     | Renders an `IMessageAcpPermission` as an Arco `Card` with radio options. On confirm, calls `conversation.confirmMessage.invoke` over IPC with `{ confirm_key, msg_id, conversation_id, call_id }`; tracks local `selected`/`isResponding`/`hasResponded` state and shows a success banner. Returns `null` when there is no `tool_call`.                    |
| `MessageAcpToolCall.tsx`       | Renders an `IMessageAcpToolCall` update as a `Card` with a `StatusTag` (pending/in_progress) and title from `kind`. Diff updates build a unified patch via `createTwoFilesPatch` + `parseDiff` and render through `FileChangesPanel` with `useDiffPreviewHandlers`; text content renders via `MarkdownView`; `rawInput` shown as markdown or JSON `<pre>`. |
| `MessageAvailableCommands.tsx` | Renders an `IMessageAvailableCommands` list inside a `CollapsibleContent` + `AionCollapse` accordion, one item per command (name/description/hint), with a `HammerAndAnvil` header. Returns `null` when empty.                                                                                                                                             |

## For AI Agents

- Renderer-only (no Node.js APIs). All cross-process actions go through `conversation.*` on the IPC bridge (`@/common/adapter/ipcBridge`), as in the permission confirm flow.
- Message prop types come from `@/common/chat/chatLib` (`IMessageAcp*`); don't redefine them here.
- Each component guards against missing/empty content and returns `null` rather than rendering empty shells — keep that pattern.
- Diff rendering must stay in a dedicated child component (`DiffContentView`) so hooks run unconditionally; do not call `useMemo`/`useDiffPreviewHandlers` inside conditional branches of `ContentView`.
- User-facing strings use `react-i18next` `t('messages.*')` keys. `MessageAcpToolCall.tsx` still uses hardcoded English labels (`Pending`, `File Edit`, `Tool Call ID:`) — prefer i18n keys for any new text.
- Use Arco components and UnoCSS utility/semantic color classes (`text-t-primary`, `bg-1`, `var(--bg-1)`); avoid raw HTML controls and hardcoded colors.

## Dependencies

### Internal

`@/common/chat/chatLib`, `@/common/adapter/ipcBridge`, `@/renderer/components/base/FileChangesPanel`, `@/renderer/components/base/AionCollapse`, `@/renderer/components/chat/CollapsibleContent`, `@renderer/components/Markdown`, `@/renderer/hooks/file/useDiffPreviewHandlers`, `@/renderer/utils/file/diffUtils`, `@/renderer/styles/colors`

### External

`@arco-design/web-react`, `@icon-park/react`, `react`, `react-i18next`, `diff`

<!-- MANUAL: notes below this line are preserved on regeneration -->
