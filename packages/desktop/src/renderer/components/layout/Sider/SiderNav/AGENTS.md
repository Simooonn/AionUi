<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# SiderNav

## Purpose

Presentational navigation/action entries rendered at the top of the conversation sidebar: a new-chat + batch-mode toolbar, a scheduled-tasks (cron) entry, and a history-search entry. Each is a stateless component that adapts its layout between expanded and `collapsed` sidebar states and forwards clicks to parent callbacks.

## Key Files

| File                      | Description                                                                                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SiderToolbar.tsx`        | New-chat trigger (`Plus`) plus a batch-manage toggle (`ListCheckbox`); active batch mode shows a primary-tinted button. Props: `isMobile`, `isBatchMode`, `collapsed`, `siderTooltipProps`, `onNewChat`, `onToggleBatchMode`. |
| `SiderScheduledEntry.tsx` | Scheduled-tasks entry (`AlarmClock`) with `isActive` highlight state. Props: `isMobile`, `isActive`, `collapsed`, `siderTooltipProps`, `onClick`.                                                                             |
| `SiderSearchEntry.tsx`    | Wraps `ConversationSearchPopover` (history search). Props: `isMobile`, `collapsed`, `siderTooltipProps`, `onConversationSelect`, optional `onSessionClick`.                                                                   |
| `index.ts`                | Barrel re-exporting the three components as named exports.                                                                                                                                                                    |

## For AI Agents

- Renderer-only React components (no Node.js APIs). All are stateless `React.FC` with typed prop interfaces and no local state.
- Each component branches on `collapsed` to return a compact icon-only variant vs. an expanded labeled variant — keep both branches in sync when changing behavior.
- All user-facing text goes through `useTranslation()` (`t('...')`); never hardcode strings. Keys live under `conversation.*`, `cron.*`.
- Icons come from `@icon-park/react` with the recurring `block leading-none` + inline `lineHeight: 0` pattern to avoid baseline gaps.
- Styling is UnoCSS utility classes via `classNames`; semantic tokens (`text-t-primary`, `bg-fill-3`, `--color-border-2`, `--primary-6`). `SiderToolbar` also pulls scoped classes from the parent `../Sider.module.css` (`newChatTrigger`, `newChatIcon`). The `sider-action-btn-mobile` / `sider-action-icon-btn-mobile` classes apply when `isMobile`.

## Dependencies

### Internal

- `@renderer/utils/ui/siderTooltip` (`SiderTooltipProps`)
- `@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover`
- `../Sider.module.css` (parent CSS module, used by `SiderToolbar`)

### External

- `react`, `react-i18next`, `classnames`, `@arco-design/web-react` (`Tooltip`), `@icon-park/react` (`Plus`, `ListCheckbox`, `AlarmClock`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
