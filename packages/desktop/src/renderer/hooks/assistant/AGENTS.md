<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# assistant

## Purpose
Renderer-side React hooks backing the Assistant settings UI (AssistantSettings page / AssistantEditDrawer). They load the assistant catalog over IPC, expose detected execution backends for selectors, and own the full create/edit/duplicate/save/delete state machine for assistants and their skills.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | Barrel re-exporting the three hooks plus the `AvailableBackend` type. |
| `useAssistantList.ts` | Loads the merged builtin+user+extension assistant list via `ipcBridge.assistants.list`, sorts it with `sortAssistants`, tracks `activeAssistantId`/`activeAssistant`, and resolves the current `localeKey`. Also exports the `isExtensionAssistant` predicate (`source === 'extension'`). |
| `useDetectedAgents.ts` | SWR-backed scan of detected execution engines (`fetchDetectedAgents` / `DETECTED_AGENTS_SWR_KEY`). Filters out `remote` agents, maps to `AvailableBackend` for Select dropdowns (`id` = backend slug), and exposes `refreshAgentDetection` (re-scan via `acpConversation.refreshCustomAgents`). |
| `useAssistantEditor.ts` | Largest hook: owns edit-drawer form state (name/description/context/avatar/agent/skills), skills state (available/custom/selected/pending/builtin auto-skills), and handlers `handleEdit/Create/Duplicate/Save/DeleteClick/DeleteConfirm/ToggleEnabled` plus `loadAssistantContext`/`loadAssistantSkills`. Takes deps (localeKey, activeAssistant, predicate, setters, Arco `message`) as params. |

## For AI Agents
- Renderer process only: NO Node.js APIs. All persistence/file/agent operations go through `ipcBridge` (`@/common`) — e.g. `assistants.list`, `fs.readAssistantRule`/`readAssistantSkill`, `acpConversation.refreshCustomAgents`.
- `useAssistantEditor` is intentionally dependency-injected (no direct list loading); wire it together with `useAssistantList` + `useDetectedAgents` at the page level and pass `loadAssistants`/`refreshAgentDetection`/`message` in.
- `editAgent` / `AvailableBackend.id` hold a backend slug (`"claude"`, `"gemini"`, `"ext-buddy"`), NOT an `AgentMetadata` row id — preserve that contract when touching backend selection.
- IPC failures are swallowed/logged (`console.error`, empty-string fallbacks); keep that resilient pattern when adding handlers.
- User-facing strings use `useTranslation` (`t`); locale-aware reads pass `localeKey` from `resolveLocaleKey(i18n.language)`.

## Dependencies
### Internal
- `@/common` (`ipcBridge`), `@/common/utils` (`resolveLocaleKey`), `@/common/types/agent/assistantTypes`
- `@/renderer/pages/settings/AssistantSettings` (`assistantUtils.sortAssistants`, `types`)
- `@/renderer/utils/model/agentTypes` (`AgentMetadata`, `fetchDetectedAgents`, `DETECTED_AGENTS_SWR_KEY`)
### External
- `react`, `react-i18next`, `swr`, `@arco-design/web-react` (`Message` type)

<!-- MANUAL: notes below this line are preserved on regeneration -->
