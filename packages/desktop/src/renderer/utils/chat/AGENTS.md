<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# chat

## Purpose
Renderer-side pure helpers for the chat experience: parsing/escaping `@file` mentions in the send box, deriving auto titles, exporting conversation transcripts, filtering `<think>` and `[SKILL_SUGGEST]` markup out of assistant text, converting LaTeX delimiters for markdown, and grouping conversation history by timeline.

## Key Files
| File | Description |
| --- | --- |
| `atFileQuery.ts` | Detects `@path` tokens around the caret (`getActiveAtFileQuery`) or across the whole string (`getAllAtFileQueries`), handles backslash escaping (`escapeAtFilePath`/`unescape`), and builds an insertion token from a `FileOrFolderItem`. |
| `conversationExport.ts` | Transcript export helpers: `readMessageContent` (normalizes string/object content), `buildConversationExportText`, filename builders/sanitizers, role mapping (`getMessageRoleKey`), and export-directory resolution. |
| `thinkTagFilter.ts` | `stripThinkTags`/`hasThinkTags`/`filterMessageContent` — removes `<think>`/`<thinking>` blocks including MiniMax-style orphaned closing tags, collapses extra newlines. |
| `skillSuggestParser.ts` | Parses/validates `[SKILL_SUGGEST]...[/SKILL_SUGGEST]` blocks into `SkillSuggestion` (rejects template placeholders); `stripSkillSuggest`/`hasSkillSuggest`. |
| `getLastAssistantText.ts` | Returns the last visible assistant text message, sanitized of think tags and skill-suggest blocks (used for copy). |
| `autoTitle.ts` | Derives a ≤50-char conversation title from the first user message (or fallback send-box content), stripping think tags and markdown prefixes. |
| `messageHistory.ts` | `getConversationInputHistory` (dedup user prompts, newest-first) and textarea caret line checks for history navigation. |
| `latexDelimiters.ts` | `convertLatexDelimiters` rewrites `\[..\]`→`$$..$$` and `\(..\)`→`$..$` while preserving fenced/inline code. |
| `timeline.ts` | Day-bucket helpers (`diffDay`, `getActivityTime`, `getTimelineLabel`, `createTimelineGrouper`) for grouping conversation history into Today/Yesterday/Recent/Earlier. |
| `chatMinimapEvents.ts` | `CHAT_MESSAGE_JUMP_EVENT` constant + `dispatchChatMessageJump` — fires a window `CustomEvent` to scroll a message into view. |

## For AI Agents
- Renderer-only code: no Node.js APIs. `chatMinimapEvents.ts` uses `window.dispatchEvent` and guards `typeof window === 'undefined'` for SSR/test safety.
- Most functions are pure and string-oriented; keep them side-effect-free and unit-testable. Message shapes come from `@/common/chat/chatLib` (`TMessage`, `IMessageText`) — `position: 'right'` = user, `'left'` = assistant.
- Think-tag and skill-suggest stripping is duplicated by design across `thinkTagFilter`, `skillSuggestParser`, and `getLastAssistantText`; if you change a stripping regex, check whether the others should match.
- `timeline.ts` and `conversationExport.ts` take the i18n `t` function / label objects as parameters rather than importing i18n directly — keep that injection pattern.

## Dependencies
### Internal
- `@/common/chat/chatLib` (`TMessage`, `IMessageText`)
- `@/common/config/storage` (`TChatConversation`)
- `@/renderer/utils/file/fileTypes` (`FileOrFolderItem`)
- Intra-directory: `conversationExport`, `thinkTagFilter` reused by `autoTitle` and `getLastAssistantText`

<!-- MANUAL: notes below this line are preserved on regeneration -->
