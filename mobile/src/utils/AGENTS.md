<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Pure TypeScript helpers for the React Native mobile app: conversation-history grouping/timeline labeling, WebSocket-message-to-UI transformation, JWT decoding, workspace path naming, and ID generation. Several files are deliberate simplified ports of desktop renderer/common equivalents, kept standalone to avoid Metro resolution of heavy import chains.

## Key Files
| File | Description |
| --- | --- |
| `groupingHelpers.ts` | Groups `Conversation[]` into pinned list + timeline sections (today/yesterday/recent7Days/earlier), each section splitting into per-workspace groups vs. workspace-less conversations. Exports `buildGroupedHistory`, `groupConversationsByTimelineAndWorkspace`, and the `WorkspaceGroup`/`TimelineItem`/`TimelineSection`/`GroupedHistoryResult` types. |
| `timeline.ts` | Timeline primitives: `diffDay`, `getActivityTime` (modifyTime → createTime → 0), `getTimelineLabel` (maps day-diff to `workspace.*` i18n keys). |
| `workspace.ts` | Workspace path helpers: `isTemporaryWorkspace` (matches `-temp-<ts>$`), `getWorkspaceDisplayName` (temp → localized label + date, else last path segment), `getLastDirectoryName`. |
| `messageAdapter.ts` | Converts raw WebSocket `IResponseMessage` into renderable `TMessage` via `transformMessage`, and merges/streams them via `composeMessage` (text concat by `msg_id`, tool/plan/codex/acp merge by call/session id). Simplified port of `chatLib.ts`. Defines local `TMessage`/`TMessageType`/`IResponseMessage` types. |
| `jwt.ts` | `decodeJwtPayload` — base64url-decodes a JWT payload (no library), returns `{ exp? }` or `null`. |
| `uuid.ts` | `uuid(length=8)` — hex ID from `crypto.getRandomValues`, falling back to a timestamp+counter string. |

## For AI Agents
- Mobile (React Native) code: no Node.js `fs`/`path` APIs and no DOM. Path splitting is done manually via regex (`split(/[\\/]+/)`), and base64 uses `atob`.
- `messageAdapter.ts` and `groupingHelpers.ts`/`timeline.ts`/`workspace.ts` are ports — when desktop equivalents change (`src/common/chatLib.ts`, `src/renderer/utils/timeline.ts`, `src/renderer/utils/workspace.ts`), keep behavior aligned but do NOT import them here (intentional duplication for Metro).
- Timeline labels and workspace display names rely on the `workspace.*` i18n keys via the passed `t` function; `getTimelineLabel` and `groupConversationsByTimelineAndWorkspace` must agree on label strings (sections are keyed by translated text).
- `messageAdapter.ts` uses `any` in its `content` types — this is the local mobile exception; new code should still prefer strict typing.

## Dependencies
### Internal
- `../context/ConversationContext` (the `Conversation` type used by grouping/timeline).
### External
- None (uses Web/RN globals `crypto`, `atob` only).

<!-- MANUAL: notes below this line are preserved on regeneration -->
