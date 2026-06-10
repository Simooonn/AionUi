<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose
React hooks for the AionUi React Native mobile app. Provides chat-message processing (grouping tool calls into collapsible summaries) and theme-aware color resolution backed by the OS color scheme.

## Key Files
| File | Description |
| --- | --- |
| `useProcessedMessages.ts` | `useProcessedMessages(messages)` memoized hook that folds consecutive tool-call messages (`tool_call`, `tool_group`, `acp_tool_call`, `codex_tool_call`) into a single `tool_summary` item. Also exports pure helpers `isToolCallType`, `isGroupComplete`, `countSteps`, `countErrors`, `getCurrentStepName`, plus the `ToolSummaryVO` / `ProcessedItem` types. |
| `useThemeColor.ts` | `useThemeColor(props, colorName)` resolves a color from explicit `{ light, dark }` props or falls back to `Colors[scheme][colorName]`, selecting the scheme via `useColorScheme()`. |

## For AI Agents
- Mobile (React Native) code, NOT the Electron renderer/main split — use RN APIs (`react-native`, `useColorScheme`), not DOM or Node.
- The four tool-call message types each carry different status shapes (`content.status` vs `content.update.status`; `'Success'/'Error'` vs lowercase `'success'/'error'`). When adding logic, branch on `msg.type` exactly as the existing helpers do; the casing differences are intentional.
- `useProcessedMessages` keys each summary by joining member message ids — keep ids stable to avoid list re-mounts.
- Tool-call internals are read via `any` casts here (e.g. `t.status`); preserve the established message types from `../utils/messageAdapter` rather than widening signatures.
- `colorName` is constrained to keys present in BOTH `Colors.light` and `Colors.dark`; keep the two palettes in sync in `../constants/theme`.

## Dependencies
### Internal
- `../utils/messageAdapter` (`TMessage`, `TMessageType`)
- `../constants/theme` (`Colors`)
### External
- `react` (`useMemo`)
- `react-native` (`useColorScheme`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
