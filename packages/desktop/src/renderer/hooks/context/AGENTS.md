<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# context

## Purpose
React Context providers + their consumer hooks for renderer-wide state: auth session, active conversation metadata, conversation history list, in-app navigation back/forward stack, feedback modal, theme/font, and responsive layout. Each file defines a `*Context`, a `*Provider`, and a `use*` hook in one module.

## Key Files
| File | Description |
| --- | --- |
| `AuthContext.tsx` | `AuthProvider` / `useAuth`. Tracks `status` (`checking`/`authenticated`/`unauthenticated`), `login`/`logout`/`refresh`. Short-circuits to authenticated in desktop runtime (`window.electronAPI`); WebUI path hits `/login`, `/logout`, `/api/auth/user` over `fetch`. CSRF helpers are stubbed (M6 removal, re-impl planned M7). |
| `ConversationContext.tsx` | `ConversationProvider` / `useConversationContext` (throws if absent) + `useConversationContextSafe` (returns null). Carries `conversation_id`, `workspace`, `type` (`acp`/`codex`/`aionrs`), `cron_job_id`, `hideSendBox`, loaded skills/MCP server snapshots. |
| `ConversationHistoryContext.tsx` | `ConversationHistoryProvider` / `useConversationHistoryContext`. Wraps `useConversationListSync` and adds `groupedHistory` via `buildGroupedHistory`. |
| `NavigationHistoryContext.tsx` | `NavigationHistoryProvider` / `useNavigationHistory`. Browser-like history stack (max 50) driven by react-router `useLocation`/`useNavigate`/`useNavigationType`; exposes `canBack`/`canForward`/`back`/`forward`. Uses `skipNextRef` to avoid double-pushes and `replace: true` on internal traversals. |
| `FeedbackContext.tsx` | `FeedbackProvider` / `useFeedback`. Renders `FeedbackReportModal`; `openFeedback(options)` can auto-capture a screenshot via `window.electronAPI.captureFeedbackScreenshot`. Hook returns a no-op fallback when no provider is mounted (web build). |
| `ThemeContext.tsx` | `ThemeProvider` / `useThemeContext`. Composes `useTheme`, `useFontScale`, `useFontSizes`; exposes light/dark `theme`+`setTheme` (back-compat), unified `activeTheme`/`selectTheme`, and font scale/size setters. |
| `LayoutContext.tsx` | `LayoutContext` + `useLayoutContext` (nullable). Holds `isMobile`, `siderCollapsed`, `setSiderCollapsed`. No provider in this file — mounted by a layout component. |

## For AI Agents
- Renderer-only: NO Node.js APIs. Cross-process work goes through `window.electronAPI` (see `FeedbackContext`, `AuthContext`).
- Runtime-mode awareness is a recurring pattern: `isDesktopRuntime = Boolean(window.electronAPI)` switches behavior between Electron and WebUI builds. Preserve both branches when editing `AuthContext`.
- Hooks split into two conventions: most `use*` throw if used outside their provider; `useConversationContextSafe`, `useLayoutContext`, `useNavigationHistory`, and `useFeedback` are intentionally null-tolerant / fallback-safe — don't change their nullability casually.
- `ConversationContextValue` mirrors fields read from `conversation.extra` (skills, mcp_servers, mcp_statuses); keep it in sync with that storage shape.
- Comments are bilingual (English + Chinese) following project convention; keep new comments in English.

## Dependencies
### Internal
`@/common/config/storage`, `@/common/theme/*`, `@/common/config/fontSizes`, `@renderer/hooks/system/useTheme`, `@renderer/hooks/ui/useFontScale`, `@renderer/hooks/ui/useFontSizes`, `@/renderer/pages/conversation/GroupedHistory/*`, `@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal`
### External
`react`, `react-router-dom`, `react-i18next`

<!-- MANUAL: notes below this line are preserved on regeneration -->
