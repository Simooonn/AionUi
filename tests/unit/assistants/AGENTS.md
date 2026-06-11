<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# assistants

## Purpose

Vitest unit tests for the AionUi Assistant Settings feature (the "N4a" work item set). Covers the pure utilities, React hooks, components under `renderer/pages/settings/AssistantSettings` and `renderer/hooks/assistant`, plus the main-process `migrateAssistants` legacy-import logic. Component tests are shallow (smoke + props-branch + callback-spy); hook/util tests assert real behavior.

## Key Files

| File                                | Description                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistantUtils.test.ts`            | Pure utils: `isEmoji`, `resolveAvatarImageSrc`, `sortAssistants` (stable, non-mutating), `filterAssistants` (by enabled/source/query + i18n name fields), `groupAssistantsByEnabled` (undefined `enabled` treated as true).                    |
| `assistantAvatarUtils.test.ts`      | Focused stub tests for `resolveAvatarImageSrc` map-lookup paths (A12).                                                                                                                                                                         |
| `migrateAssistants.test.ts`         | `legacyAssistantToCreateRequest` + `migrateAssistantsToBackend`; mocks `@/common` ipcBridge, `@/process/utils/initStorage` (`getAssistantsDir`), and `fs.promises` (readdir returns ENOENT to no-op the FS phase). Imports `BackendHttpError`. |
| `useAssistantList.dom.test.ts`      | `useAssistantList` hook + `isExtensionAssistant` predicate: load on mount, default-first selection, preserve/fallback active id on reload, error resilience.                                                                                   |
| `useAssistantEditor.dom.test.ts`    | `useAssistantEditor` hook: form state, `handleEdit`/`handleCreate`/`handleSave` create vs update flows, error logging.                                                                                                                         |
| `useDetectedAgents.dom.test.ts`     | `useDetectedAgents` hook (SWR-mocked): maps `AgentMetadata` to `availableBackends` (backend slug wins over agent_type, `remote` excluded), `refreshAgentDetection` calls ipc + `mutate`.                                                       |
| `AssistantListPanel.dom.test.tsx`   | List panel: render via `ConfigProvider`, create/edit/toggle callbacks driven through `data-testid` hooks (`btn-create-assistant`, `btn-edit-<id>`, `switch-enabled-<id>`).                                                                     |
| `AssistantEditDrawer.dom.test.tsx`  | Edit drawer smoke + props-branch (`editVisible`, `isCreating`); wraps in `MemoryRouter` + `ConfigProvider`.                                                                                                                                    |
| `DeleteAssistantModal.dom.test.tsx` | Delete-confirm modal: visibility, name display, OK/Cancel spies via role queries.                                                                                                                                                              |
| `SkillConfirmModals.dom.test.tsx`   | Skill delete-confirm modals; partially mocks Arco `Message.useMessage`.                                                                                                                                                                        |

## For AI Agents

- These tests target source under `@/renderer/...` and `@/process/...` via path aliases; keep imports aligned if you move the implementation.
- Common mock pattern: `react-i18next.useTranslation` is stubbed to `t: (k) => k`, so assertions match raw i18n keys, not translated text.
- `@/common` ipcBridge is always mocked per-file with only the methods each test exercises — extend the mock object when the implementation gains new ipc calls, or the test throws on undefined `.invoke`.
- DOM tests use `@testing-library/react` + `@testing-library/user-event`; always wrap UI in `ConfigProvider` (and `MemoryRouter` where routing is used), and `cleanup()` in `afterEach`.
- Component tests are intentionally shallow — prefer `data-testid` selectors over deep Arco DOM traversal; the panel test relies on testids that must exist in the source.
- `migrateAssistants.test.ts` runs main-process code, so its `fs` mock returns ENOENT to keep the filesystem migration phase a no-op; do not assume real disk access.

## Dependencies

### Internal

`@/renderer/pages/settings/AssistantSettings/*` (components, `assistantUtils`, `types`), `@/renderer/hooks/assistant/*`, `@/renderer/utils/model/agentTypes`, `@/process/utils/migrateAssistants`, `@/common` (ipcBridge), `@/common/types/agent/assistantTypes`, `@/common/adapter/httpBridge`.

### External

`vitest`, `@testing-library/react`, `@testing-library/user-event`, `@arco-design/web-react`, `react-router-dom`, `swr`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
