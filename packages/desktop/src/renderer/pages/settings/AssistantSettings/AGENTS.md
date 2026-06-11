<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# AssistantSettings

## Purpose

Renderer settings page for managing AionUi assistants: list, create, duplicate, enable/disable, edit (name/avatar/description/agent/prompt/skills), and delete. State lives in the `useAssistantList` / `useAssistantEditor` / `useDetectedAgents` hooks (from `@/renderer/hooks/assistant`); the files here are the presentational shell wired to those hooks.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                | Page entry (`AssistantSettings`). Composes the assistant hooks and renders the list panel, edit drawer, and modals. Handles route/`sessionStorage` intent (`guid.openAssistantEditorIntent`, nav `state`) to auto-open the editor for a target assistant, and reads `?highlight=` search param. Header comment documents per-source edit permissions (builtin/extension are fully read-only; only `custom`/user assistants editable). |
| `AssistantEditDrawer.tsx`  | Largest file. Drawer for create/edit: identity fields, agent backend selector, prompt editor with `edit`/`preview` markdown toggle, and skills section (selected/pending/custom/builtin-auto). Fully prop-driven by the editor hook; builtin readonly banner offers `handleDuplicate` to make an editable copy.                                                                                                                       |
| `AssistantListPanel.tsx`   | Collapsible/searchable list with avatar, enabled `Switch`, edit/duplicate actions, filter `Tabs`. Supports `highlightId` scroll-into-view-and-highlight via `cardRefs`.                                                                                                                                                                                                                                                               |
| `assistantUtils.ts`        | Pure helpers: `isEmoji`, `resolveAvatarImageSrc` (resolves emoji/image/extension-asset URLs), `sortAssistants` (by `sort_order`), `filterAssistants` (query + `AssistantListFilter`), `groupAssistantsByEnabled`.                                                                                                                                                                                                                     |
| `AssistantAvatar.tsx`      | Renders avatar as image, emoji, or `Robot` fallback icon via Arco `Avatar`.                                                                                                                                                                                                                                                                                                                                                           |
| `DeleteAssistantModal.tsx` | Danger-styled confirmation modal for deleting an assistant.                                                                                                                                                                                                                                                                                                                                                                           |
| `SkillConfirmModals.tsx`   | Two confirm modals: remove pending (not-yet-imported) skill, and remove custom skill from the assistant.                                                                                                                                                                                                                                                                                                                              |
| `types.ts`                 | Local types: `SkillInfo`, `SkillSource`, `ExternalSource`, `PendingSkill`, `BuiltinAutoSkill`, `AssistantListItem` (= `Assistant`).                                                                                                                                                                                                                                                                                                   |

## For AI Agents

- Renderer-only code — no Node.js APIs. Cross-process data flows through the assistant hooks, not direct IPC here.
- This directory is the view layer; mutation/persistence logic belongs in `@/renderer/hooks/assistant`. Add editing state to the hook and thread it through props, not local state, to keep the drawer/list consistent.
- Respect the source-based permission matrix in `index.tsx`: `builtin` and `extension` assistants are read-only (all controls + Save disabled); only `user`/custom are editable/deletable.
- All user-facing text uses `useTranslation()` with `settings.*` / `common.*` keys and a `defaultValue` — keep that pattern when adding strings.
- `avatarImageMap` maps special avatars (e.g. `cowork.svg`, the 🛠️ emoji) to bundled SVGs; pass it down rather than re-resolving images locally.
- Modals use explicit `wrapStyle`/`maskStyle` z-index (10000/9999) to sit above the drawer — match this for new modals.

## Dependencies

### Internal

`@/renderer/hooks/assistant` (assistant list/editor/detection hooks, `AvailableBackend`), `@/common/types/agent/assistantTypes` (`Assistant`), `@/renderer/utils/platform` (`resolveExtensionAssetUrl`), `@/renderer/components` (base `AionScrollArea`, `Markdown`, chat `EmojiPicker`, settings `SettingsPageWrapper`/`settingsViewContext`), `@/renderer/hooks/context/LayoutContext`.

### External

`@arco-design/web-react`, `@icon-park/react`, `react`, `react-router-dom`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
