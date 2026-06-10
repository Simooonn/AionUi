<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# contents

## Purpose
Each file here is one tab/page body rendered inside the settings shell (`SettingsModal`/page mode) — Model, Tools, WebUI, Appearance, Agent, About, plus the bug-report modal. They read `useSettingsViewMode()` to adapt between modal and full-page layouts and delegate heavy logic to `pages/settings/**` and hooks.

## Key Files
| File | Description |
| --- | --- |
| `ModelModalContent.tsx` | LLM provider/model management UI: add/edit platforms and models, protocol badges (gemini/anthropic/openai), health checks. Consumes deep-link via `consumePendingDeepLink`. |
| `ToolsModalContent.tsx` | MCP server management plus builtin image-generation and speech-to-text config; uses the `hooks/mcp` suite and `configService`. |
| `WebuiModalContent.tsx` | Remote WebUI server controls (start/stop, port, status) and channel-logo strip linking to channel setup. |
| `AppearanceModalContent.tsx` | Theme gallery, zoom scale, and per-region font-size steppers via `useThemeContext`; defines local `PreferenceRow`. |
| `AgentModalContent.tsx` | Tabbed host for `LocalAgents`; syncs active tab to `?tab=` search param (collapses legacy `remote` → `local`). |
| `AboutModalContent.tsx` | App version (`__APP_VERSION__` define), external links, prerelease-update toggle (localStorage), opens FeedbackReportModal; dispatches `aionui-open-update-modal` window event. |
| `FeedbackReportModal.tsx` | Bug-report form (description, module Select, up to 3 screenshot uploads incl. paste) submitting Sentry tags/extras. Exports `PrefilledScreenshot`, `FeedbackEventTags`, `FeedbackEventExtra`. |
| `ExtensionSettingsTabContent.tsx` | Renders an extension-contributed settings page: external https URLs in `WebviewHost`, local backend URLs in a sandboxed iframe with a `postMessage` `aion:init` locale bridge. |
| `feedbackModules.ts` | `FEEDBACK_MODULES` const list mapping each report module to i18n keys + Sentry `tag`; consumed by FeedbackReportModal. |

## Subdirectories
| Directory | Purpose |
| --- | --- |
| `SystemModalContent` | System-settings tab content (see `SystemModalContent/AGENTS.md`). |
| `channels` | Per-channel (Telegram, Slack, Discord, etc.) configuration UIs (see `channels/AGENTS.md`). |

## For AI Agents
- Renderer-only code: no Node.js APIs. All backend access goes through IPC (`@/common/adapter/ipcBridge`, `configService`, `mcpService`, `extensions`, `webui`, `shell`).
- Each content component should call `useSettingsViewMode()` and pass `disableOverflow={isPageMode}` to `AionScrollArea` so page mode scrolls the outer container, not the inner area.
- All user-facing strings via `useTranslation()` i18n keys; never hardcode. New feedback report categories: add an entry to `feedbackModules.ts` plus its two i18n keys.
- App version comes from the `__APP_VERSION__` build define (repo-root package.json) — do NOT import `package.json` (the desktop workspace one is pinned at `0.0.0`).
- Renderer-internal signaling uses `window.dispatchEvent`/`CustomEvent` (e.g. `aionui-open-update-modal`), since `buildEmitter` only flows main → renderer.

## Dependencies
### Internal
`@/common/adapter/ipcBridge`, `@/common/config/*`, `@renderer/components/base/*` (AionScrollArea, AionModal, ModalWrapper, AionSelect), `@/renderer/pages/settings/**`, `@/renderer/hooks/**` (agent, mcp, system), `@/renderer/utils/platform`, `../settingsViewContext`
### External
`@arco-design/web-react`, `@icon-park/react`, `react-i18next`, `react-router-dom`, `classnames`

<!-- MANUAL: notes below this line are preserved on regeneration -->
