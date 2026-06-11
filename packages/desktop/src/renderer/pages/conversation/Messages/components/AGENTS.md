<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Presentational React components for individual chat message types in the conversation view. Each `Message*` component renders one variant of `TMessage` (text, thinking, tool calls, permission prompts, agent status, plans, cron triggers, skill suggestions); the parent `Messages/` renderer dispatches to these by message type.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MessageText.tsx`             | Renders user/agent text via `MarkdownView`; parses `AIONUI_FILES_MARKER` into attachments, strips `<think>` and skill-suggest tags, shows file previews, copy button, and teammate avatar. Exports `formatMessageTime` and `resolveMessageFilePath` helpers. |
| `MessageThinking.tsx`         | Collapsible "thinking" block with a live elapsed timer (active) or total duration (done); auto-collapses and auto-scrolls during streaming. Styled via `MessageThinking.module.css`.                                                                         |
| `MessageToolGroup.tsx`        | Largest component: renders a grouped set of tool calls with confirmation buttons (edit/exec/mcp), diff panels, image/file results, and collapsible output.                                                                                                   |
| `MessageToolCall.tsx`         | Single tool-call card with status badge and a `ReplacePreview` that builds a unified diff via `createTwoFilesPatch`.                                                                                                                                         |
| `MessageToolGroupSummary.tsx` | Compact summary view of normalized tool calls; lazily fetches full (untruncated) tool detail from the DB over `ipcBridge` on expand.                                                                                                                         |
| `MessagePermission.tsx`       | Permission-request card with radio options; sends decision via `ipcBridge.conversation.confirmation.confirm`. `React.memo`.                                                                                                                                  |
| `MessageTips.tsx`             | Collapsible tip/notice (success/warning/error) with error-ownership tagging and a `FeedbackButton`.                                                                                                                                                          |
| `MessageAgentStatus.tsx`      | ACP agent connection-status badge (connecting/connected/error, etc.); resolves display name via `useConversationAgents`.                                                                                                                                     |
| `MessagePlan.tsx`             | Collapsible to-do list rendering plan entries with completed/pending markers.                                                                                                                                                                                |
| `MessageCronTrigger.tsx`      | Clickable banner for a scheduled-task trigger artifact; navigates to `/scheduled/:id`.                                                                                                                                                                       |
| `MessageCronBadge.tsx`        | Small "triggered at" pill shown above cron-originated messages.                                                                                                                                                                                              |
| `MessageSkillSuggest.tsx`     | Parses a skill-suggest artifact payload and delegates to `SkillSuggestCard`.                                                                                                                                                                                 |
| `SkillSuggestCard.tsx`        | Card to save/dismiss a suggested skill; checks existence via `ipcBridge.cron.hasSkill` and updates artifact status.                                                                                                                                          |
| `SelectionReplyButton.tsx`    | Floating "quote/reply" button for selected message text; reads selection across Shadow DOM (MarkdownView) and emits via `emitter`.                                                                                                                           |
| `TeammateMessageAvatar.tsx`   | Avatar next to a teammate's bubble; prefers preset-assistant icon (SWR-cached) over backend logo.                                                                                                                                                            |
| `MessageThinking.module.css`  | Styles for the thinking block (header, body, collapse, arrow).                                                                                                                                                                                               |
| `MessageToolGroupSummary.css` | Shared styles imported by both `MessageToolCall` and `MessageToolGroupSummary`.                                                                                                                                                                              |

## For AI Agents

- Renderer process only — no Node.js APIs. All cross-process work goes through `ipcBridge` from `@/common`.
- All user-facing strings use `react-i18next` `t()`; never hardcode. Many calls pass `defaultValue` as a fallback.
- Message content types come from `@/common/chat/chatLib` (`IMessage*`); tool-call shaping comes from `@/common/chat/normalizeToolCall`. Reuse these rather than re-parsing.
- Use `@arco-design/web-react` components and `@icon-park/react` icons (note: some files use `@arco-design/web-react/icon` for `IconDown`/`IconRight`). Colors via `@/renderer/styles/colors` `iconColors` or CSS variables — avoid hardcoded hex (`MessagePlan.tsx` still uses literal colors; do not copy that pattern).
- Artifact payloads (`MessageCronTrigger`, `MessageSkillSuggest`) may arrive as a JSON string or object and use both snake_case and camelCase keys — keep the defensive parse/normalize blocks.
- `SelectionReplyButton` must handle selections inside Shadow DOM since `MarkdownView` renders there.

## Dependencies

### Internal

`@/common` (`ipcBridge`, `chat/chatLib`, `chat/normalizeToolCall`, `config/constants`), `@renderer/components` (`Markdown`, `media/*`, `chat/CollapsibleContent`, `base/*`), `@/renderer/styles/colors`, `@/renderer/utils` (`emitter`, `chat/*`, `file/diffUtils`, `model/agentLogo`), `@renderer/hooks` (context/agent/file hooks), sibling `Messages/` modules (`MessageList`, `MessageFileChanges`, `constants`, `types`, `artifacts`).

### External

`react`, `react-i18next`, `react-router-dom`, `@arco-design/web-react`, `@icon-park/react`, `diff`, `swr`, `classnames`, `@office-ai/platform`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
