<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# legacy

## Purpose
Holds the read-only conversation renderer for legacy/non-interactive conversation views — it displays an existing conversation's message history without a send box. Used where a conversation must be shown but not continued (e.g. cron-job conversations).

## Key Files
| File | Description |
| --- | --- |
| `LegacyReadOnlyConversation.tsx` | React component that renders a conversation as a scrollable `MessageList` with no input. Takes a `TChatConversation` plus an optional `emptySlot`, wires up `ConversationProvider` (type `'acp'`, `hideSendBox: true`, propagating `workspace`, `cron_job_id`, and loaded `skills` from `conversation.extra`) and `ConversationArtifactProvider`. Default export is wrapped via `HOC.Wrapper` with `MessageListProvider` and `MessageListLoadingProvider`. |

## For AI Agents
- Renderer-only React/TSX — no Node.js APIs.
- The component primes the message cache with `useMessageLstCache(conversation.id)` before rendering; keep that call if you refactor.
- `hideSendBox: true` is intentional — this view is read-only. Don't add input/send UI here.
- `conversation.extra` is loosely typed; the file uses inline casts (`as string | undefined`, `as { skills?: string[] }`) to read `cron_job_id` and `skills`. Preserve narrow casts rather than introducing `any`.
- Layout uses UnoCSS utilities (`flex-1 flex flex-col px-20px min-h-0`) inside `FlexFullContainer`; follow the same utility-class style.

## Dependencies
### Internal
- `@/common/config/storage` (`TChatConversation` type)
- `@/renderer/hooks/context/ConversationContext` (`ConversationProvider`)
- `@renderer/components/layout/FlexFullContainer`
- `@renderer/pages/conversation/Messages/MessageList`, `.../Messages/artifacts`, `.../Messages/hooks`
- `@renderer/utils/ui/HOC`

### External
- `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
