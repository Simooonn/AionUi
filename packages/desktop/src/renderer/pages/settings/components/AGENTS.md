<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# components

## Purpose

Shared React (renderer) building blocks for the Settings pages: the modal dialogs for adding/editing model providers, models, API keys and MCP servers, plus the settings navigation shell (sidebar + page wrapper) that mixes builtin tabs with extension-contributed tabs.

## Key Files

| File                      | Description                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AddPlatformModal.tsx`    | Largest modal; adds a model provider/platform. Detects API protocol (openai/gemini/anthropic) via `useProtocolDetection`, handles new-api platforms and Google APIs hosts, embeds `ApiKeyEditorModal`. |
| `AddModelModal.tsx`       | `ModalHOC` dialog to add a model to an existing `IProvider`; lists available models via `useModeModeList`, supports per-model protocol config for new-api platforms.                                   |
| `EditModeModal.tsx`       | `ModalHOC` Arco `Form` editor for an existing provider; provider logo, Bedrock auth-method conditional fields, model-list refresh.                                                                     |
| `ApiKeyEditorModal.tsx`   | Manages a comma-separated `api_keys` string as a per-key editable list with status (`pending`/`testing`/`valid`/`invalid`) and optional `onTestKey` validation.                                        |
| `AddMcpServerModal.tsx`   | Router shell that picks between `JsonImportModal` and `OneClickImportModal` based on detected agents (`getAgents`) and `importMode`.                                                                   |
| `JsonImportModal.tsx`     | CodeMirror JSON editor to import/edit MCP server config; includes a `shellSplit` parser and `parseMcpJsonImport` from `../ToolsSettings/mcpJsonImport`.                                                |
| `OneClickImportModal.tsx` | Detects MCP servers from installed agents (Claude/Codex) via `mcpService` and batch-imports them, showing per-server importable status.                                                                |
| `SettingsSider.tsx`       | Settings sidebar; exports `BUILTIN_TAB_IDS`, `LEGACY_ANCHOR_REMAP`, group headers; merges builtin and extension tabs.                                                                                  |
| `SettingsPageWrapper.tsx` | Page chrome around settings content; exports `getBuiltinSettingsNavItems`; provides `SettingsViewModeProvider`, mobile top-nav.                                                                        |
| `settings.css`            | Mobile-only (`max-width: 767px`) styles for the settings top nav pill bar.                                                                                                                             |

## For AI Agents

- Renderer-only code (no Node.js APIs); cross-process calls go through `ipcBridge` / `mcpService` from `@/common`.
- Modals follow two patterns: `ModalHOC<Props>(...)` wrappers driven by `modalCtrl` (AddModel, EditMode), and plain `visible/onCancel`-prop components (ApiKey, JsonImport, OneClickImport). Match the existing pattern when editing a given file.
- Use `AionModal` (and `AionSteps`) from `@/renderer/components/base`, not raw Arco `Modal`, for new dialogs; `ApiKeyEditorModal` still uses Arco `Modal` directly.
- All user-facing text uses `useTranslation()` / `t(...)` with `settings.*` keys; never hardcode strings.
- `SettingsSider` and `SettingsPageWrapper` share constants (`BUILTIN_TAB_IDS`, `LEGACY_ANCHOR_REMAP`) and must stay in sync with router paths and i18n group-header keys.
- Comments here are mixed Chinese/English; keep new comments in English per project convention.

## Dependencies

### Internal

`@/common` (`ipcBridge`, `mcpService`, `config/storage` types, `utils`), `@/renderer/components/base` (`AionModal`, `AionSteps`), `@/renderer/utils/ui/ModalHOC`, `@/renderer/utils/model/modelPlatforms`, `@renderer/hooks/*` (`useModeModeList`, `useProtocolDetection`, `useAgents`, `useExtensionSettingsTabs`), `../ToolsSettings/mcpJsonImport`.

### External

`@arco-design/web-react`, `@icon-park/react`, `react-i18next`, `react-router-dom`, `@uiw/react-codemirror` + `@codemirror/lang-json`, `classnames`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
