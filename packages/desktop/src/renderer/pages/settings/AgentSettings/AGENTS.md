<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# AgentSettings

## Purpose
Renderer settings UI for managing AI agents: auto-detected CLI agents, user-authored custom (local) agents, downloadable Hub agents, assistant presets, and remotely paired agents. `index.tsx` is the routed settings page; the other files are the building blocks for local vs. remote agent management.

## Key Files
| File | Description |
| --- | --- |
| `index.tsx` | Routed settings page; wraps `AgentModalContent` in `SettingsPageWrapper`. |
| `RemoteAgents.tsx` | Barrel re-exporting `RemoteAgentManagement` as default. |
| `RemoteAgentManagement.tsx` | Remote agent CRUD + pairing flow (handshake/pending/timeout polling, status tags, guide link). Uses SWR and `ipcBridge`. |
| `LocalAgents.tsx` | Lists detected agents (`agent_type` acp/aionrs) and custom agents from `useAgents`; handles create/update/delete via `acpConversation` IPC; opens editor and Hub modal. |
| `InlineAgentEditor.tsx` | Form to author a custom agent (`CustomAgentDraft`); env vars, args parsing (`parseArgsString`), emoji icon, JSON advanced overrides via CodeMirror; runs CLI/ACP connectivity test. |
| `AgentCard.tsx` | Presentational card with two variants: `detected` (logo + go-to-chat) and `custom` (toggle/edit/delete). |
| `AgentHubModal.tsx` | Modal browsing AionHub agents via `useHubAgents`; install/retry/update with per-status action buttons. |
| `PresetManagement.tsx` | Edit/delete user-authored assistant presets (`source === 'user'`) via `assistants` IPC; CodeMirror markdown context editor. |

## For AI Agents
- Renderer process only — no Node.js APIs. All backend calls go through `ipcBridge` / `acpConversation` / `assistants` from `@/common`.
- `CustomAgentDraft` (exported from `InlineAgentEditor`) intentionally mirrors the backend `CustomAgentUpsertRequest` body minus `id`; keep it aligned with the IPC contract rather than adding conversion layers.
- Data fetching is split between `useAgents`/`useHubAgents` hooks and direct SWR; after mutations call `revalidate`/`mutate(DETECTED_AGENTS_SWR_KEY)` to refresh lists.
- Use `@arco-design/web-react` components and `@icon-park/react` (or `@arco-design/web-react/icon` in `AgentHubModal`) icons; all visible strings go through `useTranslation` under `settings.agentManagement.*`. Colors use CSS variables / `bg-aou-*` UnoCSS tokens.
- Detected vs. custom agents are distinguished by `agent_source === 'custom'`; presets are filtered by `source === 'user'` (builtin/extension are read-only).

## Dependencies
### Internal
`@/common` (ipcBridge, types, adapters), `@/renderer/components/*` (AionModal, ModalWrapper, EmojiPicker, settings content/wrapper), `@/renderer/hooks/agent/*` (useAgents, useHubAgents), `@/renderer/utils/model/*` (agentLogo, agentTypes), `@/renderer/utils/platform`, `@/renderer/pages/guid/hooks/agentSelectionUtils`.
### External
`react`, `react-i18next`, `react-router-dom`, `swr`, `@arco-design/web-react`, `@icon-park/react`, `@uiw/react-codemirror`, `@codemirror/lang-json`, `@codemirror/lang-markdown`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
