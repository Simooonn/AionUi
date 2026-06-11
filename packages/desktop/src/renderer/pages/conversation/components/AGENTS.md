<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Renderer-side React components composing the conversation page shell: the active chat view dispatcher, the left-rail history/session list, title rename UI, workspace sidebar slot, and skill-related indicators. These are the building blocks assembled inside `ChatLayout` for a single conversation.

## Key Files

| File                              | Description                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatConversation.tsx`            | Top-level conversation container. Resolves runtime view via `useConversationRuntimeView`, dispatches to platform chat components (`AcpChat`, `AionrsChat`, `LegacyReadOnlyConversation`) and model selectors based on `conversation.type`; handles new-chat creation, associated-conversation dropdown, and skill-mount checks. |
| `ChatHistory.tsx`                 | Conversation history list grouped by timeline (`createTimelineGrouper`). Supports rename (inline `Input`), delete (`Popconfirm`), navigation, cron-job indicators, scroll-into-view of the active item, and mobile focus handling.                                                                                              |
| `ChatSlider.tsx`                  | Workspace sidebar slot. Renders `ChatWorkspace` for `acp`/`codex`/`aionrs` conversations that carry `extra.workspace`, passing a per-type `eventPrefix`; renders an empty `<div>` otherwise.                                                                                                                                    |
| `ChatTitleEditor.tsx`             | Presentational inline title with double-click-to-edit rename. Controlled via props (`editingTitle`, `titleDraft`, `submitTitleRename`); embeds `ConversationTitleMinimap` in a hover-revealed trailing region.                                                                                                                  |
| `ConversationSkillsIndicator.tsx` | Pill showing count of skills mounted on the conversation (`conversation.extra.skills`); `Popover` lists them joined with the global skill index from `ipcBridge.fs.listAvailableSkills`, linking to settings.                                                                                                                   |
| `SkillRuleGenerator.tsx`          | Modal/dropdown UI to generate or load skill rule files from the workspace (filters `.json/.md/.py/.txt` via `ipcBridge.fs.getFilesByDir`). Currently commented out in `ChatConversation`.                                                                                                                                       |
| `WorkspaceCollapse.tsx`           | Generic collapsible panel for workspace grouping with `header`/`trailing` slots; force-expands and hides its header when the sider is collapsed.                                                                                                                                                                                |

## Subdirectories

| Directory                  | Purpose                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `ChatLayout`               | Conversation page layout shell that composes these components (see `ChatLayout/AGENTS.md`).        |
| `ConversationTitleMinimap` | Minimap navigation widget embedded in the title editor (see `ConversationTitleMinimap/AGENTS.md`). |

## For AI Agents

- Renderer process only — no Node.js APIs; reach the main process exclusively through `ipcBridge` from `@/common` (e.g. `ipcBridge.conversation.*`, `ipcBridge.fs.*`).
- Conversation type branching keys off `conversation.type` (`acp`, `codex`, `aionrs`, legacy) and reads loosely-typed `conversation.extra` (e.g. `extra.workspace`, `extra.skills`, `extra.is_temporary_workspace`) with inline cast types — keep these guarded with optional chaining.
- All user-facing text uses `react-i18next` (`useTranslation`); do not hardcode strings. UI uses `@arco-design/web-react` + `@icon-park/react`; styling is UnoCSS utilities with CSS-variable color tokens (`var(--color-*)`, `text-t-primary`).
- `ChatTitleEditor` is purely presentational/controlled; rename state and submission live in the parent. `WorkspaceCollapse`/`SkillRuleGenerator` use Chinese inline comments — match the existing comment language when editing those files.

## Dependencies

### Internal

`@/common` (ipcBridge), `@/common/config/storage` (types), `../platforms/*` (acp/gemini/aionrs/legacy chat + selectors), `../runtime/useConversationRuntimeView`, `../utils/*` (conversationCache, conversationRuntime, conversationCreateError), `../Workspace`, `@/renderer/pages/cron`, `@/renderer/hooks/*`, `@/renderer/utils/*`, `./ChatLayout`, `./ConversationTitleMinimap`.

### External

`react`, `react-i18next`, `react-router-dom`, `swr`, `@arco-design/web-react`, `@icon-park/react`, `classnames`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
