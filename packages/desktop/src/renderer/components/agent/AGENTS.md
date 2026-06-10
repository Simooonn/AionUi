<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# agent

## Purpose
Renderer UI components for displaying and controlling the active AI agent in a conversation: agent identity badge, model/mode selectors (ACP backends), context-usage gauge, setup guidance card, and channel-conflict warnings. These compose into the conversation header/SendBox area.

## Key Files
| File | Description |
| --- | --- |
| `AcpModelSelector.tsx` | Model picker for ACP agents. Three states: disabled "Use CLI model" button (no `model_info`), read-only label (`!canSwitch`), or click Dropdown of `available_models`. Data comes from `useAcpModelInfo`; warmup via `warmupConversation`. |
| `AgentModeSelector.tsx` | Mode/permission selector for ACP agents. Reads modes from static `getAgentModes` or `dynamicModes`/`config_options` (`extractModesFromConfigOptions`), persists via `savePreferredMode`, switches over `ipcBridge`. Has full vs `compact` rendering. |
| `AgentBadge.tsx` | Agent identity badge (logo + name). Exports `AgentLogoIcon` (custom logo/emoji → backend logo → `Robot` fallback). Clicking with `assistantId` navigates to AssistantSettings editor. |
| `AgentSetupCard.tsx` | Card above SendBox when current agent lacks auth/API key. Guides setup or auto-switches to `bestAgent`; creates/switches conversation via `ipcBridge`. Collapsible, with progress. |
| `ContextUsageIndicator.tsx` | SVG ring gauge of token usage vs `context_limit` (warning >70%, danger >90%), Popover detail. Exports `formatTokenCount` (K/M formatting). |
| `MarqueePillLabel.tsx` | Pill text label that clips when tight and plays a seamless hover marquee (desktop only) using a hidden measurement span + refs in `useLayoutEffect`. |
| `ChannelConflictWarning.tsx` | Arco `Alert` warning when OpenClaw owns a Lark/Telegram channel. Exports full `ChannelConflictWarning` and compact `ChannelConflictBanner`. |

## For AI Agents
- Renderer process only — no Node.js APIs. Cross-process calls go through `ipcBridge` / `configService` from `@/common`.
- Use `@arco-design/web-react` components and `@icon-park/react` icons; styling is UnoCSS utility classes plus semantic CSS vars (e.g. `rgb(var(--primary-6))`, `var(--color-fill-3)`). No hardcoded colors.
- All user-facing text uses `useTranslation()` i18n keys — except `ChannelConflictWarning.tsx`, which currently hardcodes English copy; do not copy that pattern into new components.
- `AcpModelSelector` and `AgentModeSelector` both reuse `MarqueePillLabel` for the truncating header pill and read `useLayoutContext().isMobile` for mobile-specific behavior (e.g. portal Dropdown to `document.body`).

## Dependencies
### Internal
- `@/common` (ipcBridge, configService, acpTypes), `@/renderer/hooks/agent/*`, `@/renderer/hooks/context/LayoutContext`, `@/renderer/utils/model/*` (agentLogo, agentModes, modelContextLimits), `@/renderer/pages/conversation/utils/*`, `@/renderer/pages/guid/hooks/agentSelectionUtils`, `@/renderer/styles/colors`.
### External
- `react`, `react-i18next`, `react-router-dom`, `@arco-design/web-react`, `@icon-park/react`, `classnames`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
