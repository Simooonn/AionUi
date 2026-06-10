<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# constants

## Purpose
Static configuration tables for the React Native mobile app: per-backend agent permission modes (Claude, Qwen, OpenCode, Gemini, Codex, Cursor, Snow) and the light/dark color palette plus platform font choices.

## Key Files
| File | Description |
| --- | --- |
| `agentModes.ts` | `AGENT_MODES` record mapping each agent backend type to its available `AgentModeOption[]` (value/label/optional description). Exports `getAgentModes(backend)` and `supportsModeSwitch(backend)` helpers. Labels mirror CLI display text exactly — intentionally NOT i18n. |
| `theme.ts` | `Colors` object with `light`/`dark` token sets (text, background, surface, border, tint, error/success/warning, code and tip backgrounds, etc.) and `Fonts` via `Platform.select` (iOS `system-ui`/`ui-monospace`, default `normal`/`monospace`). |

## For AI Agents
- React Native module, not Electron — no DOM and no `packages/desktop` imports. `theme.ts` imports `Platform` from `react-native`.
- Mode `value` strings are sent to the agent over ACP `session/set_mode`; do not rename them casually. Read the per-backend comment block in `agentModes.ts` before editing (e.g. Qwen plan mode is intentionally omitted pending an upstream fix; Codex `default` is labeled `Plan`).
- Color values here are hardcoded hex per theme by design (the desktop UnoCSS semantic-token rule does not apply to this RN file). Add new colors to BOTH `light` and `dark` to keep parity.

## Dependencies
### External
- `react-native` (`Platform`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
