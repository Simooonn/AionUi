<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Presentational sub-components for the "guid" landing/welcome page (the new-conversation entry screen). They render the agent pill bar, assistant/preset selectors, the prompt input card with its action row, model selector, workspace footnote, and assorted call-to-action buttons. Most are controlled components driven by props lifted from the parent `guid` page.

## Key Files

| File                         | Description                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GuidInputCard.tsx`          | Main prompt textarea card; composes file previews, upload progress, mention dropdown/badge, the action row, and `GuidWorkspaceFootnote`. Wires drag/paste/focus/blur and `useCompositionInput`. |
| `GuidActionRow.tsx`          | Bottom toolbar of the input card: file upload, model selector slot, `AgentModeSelector`, `PresetAgentTag`, skills/MCP toggles, and submit (ArrowUp) button.                                     |
| `GuidModelSelector.tsx`      | Dual-mode model dropdown — Gemini provider/model list (filters disabled providers, shows health via `useProvidersQuery`) vs. ACP cached model info.                                             |
| `AgentPillBar.tsx`           | Horizontal selectable pill bar of `AvailableAgent`s with logos; mobile-aware sizing; has a "+" pill that navigates to add an agent.                                                             |
| `AssistantSelectionArea.tsx` | Preset-assistant selection surface wiring assistant CRUD drawers/modals (`AssistantEditDrawer`, `DeleteAssistantModal`, `SkillConfirmModals`) and preset prompt examples.                       |
| `PresetAgentTag.tsx`         | Removable tag showing the active preset agent (localized name from `name_i18n`); optional dropdown switcher. Exports `AgentSwitcherItem`.                                                       |
| `MentionDropdown.tsx`        | `@`-mention menu listing `MentionOption`s (avatar image/emoji/logo fallback to `Robot` icon).                                                                                                   |
| `GuidWorkspaceFootnote.tsx`  | Workspace-directory selector footnote; portal dropdown of recent workspaces with search, backed by `addRecentWorkspace`/`getRecentWorkspaces`.                                                  |
| `QuickActionButtons.tsx`     | Bug-report / repo / WebUI shortcut buttons; polls `webui.getStatus` with a 3s module-level status cache.                                                                                        |
| `SkillsMarketBanner.tsx`     | Toggle banner enabling/disabling the Skills Market via `ipcBridge.fs.enableSkillsMarket` and `configService`.                                                                                   |
| `GuidSkeleton.tsx`           | Exports `AgentPillBarSkeleton` and `AssistantsSkeleton` shimmer placeholders shown while agents load.                                                                                           |

## For AI Agents

- Renderer-only code: no Node.js APIs. Cross-process access goes through `ipcBridge` / `webui` / `configService` from `@/common`, never direct fs/IPC.
- Shared types come from the parent `../types` (`AvailableAgent`, `MentionOption`, `AcpModelInfo`, `EffectiveAgentInfo`) and `../constants` (`CUSTOM_AVATAR_IMAGE_MAP`); styling from `../index.module.css`.
- Avatars/extension assets must be resolved via `resolveExtensionAssetUrl` before use in `<img src>`.
- These are mostly dumb/controlled components — keep state in the parent page and pass callbacks; preserve the existing prop-drilling contract when editing.
- All user-facing strings use `useTranslation` i18n keys; mobile branches read `useLayoutContext().isMobile`. Use `@arco-design/web-react` and `@icon-park/react`, not raw HTML controls (the inline SVG icons in `GuidWorkspaceFootnote` are an existing exception).

## Dependencies

### Internal

`@/common` (ipcBridge, configService, types), `@/renderer/hooks` (assistant, context/LayoutContext, chat/useCompositionInput, agent/useModelProviderList), `@/renderer/components` (media, workspace, agent/AgentModeSelector), `@/renderer/pages/settings/AssistantSettings`, `@/renderer/utils/platform` & `model/*`, sibling `../types`/`../constants`/`../utils/modelUtils`.

### External

`react`, `react-dom` (createPortal), `react-router-dom`, `react-i18next`, `@arco-design/web-react`, `@icon-park/react`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
