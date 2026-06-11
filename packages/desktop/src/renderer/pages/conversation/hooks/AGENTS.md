<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# hooks

## Purpose

Renderer-side React hooks scoped to the conversation page. They handle the three-panel (chat / preview / workspace) layout math, workspace-panel collapse state, inline title rename, container width tracking, and fetching the agent/assistant list for the conversation selector.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useContainerWidth.ts`     | Tracks a container element's width via `ResizeObserver`, falling back to `window.innerWidth` before mount. Returns `{ containerRef, containerWidth }`. SSR-safe (guards `typeof window`/`ResizeObserver`).                                                                                                                                                       |
| `useLayoutConstraints.ts`  | Side-effect-only hook (returns `void`). Clamps `workspaceWidthPx` and `chatSplitRatio` against pixel minimums from `layoutCalc`, and auto-collapses the workspace when the container can't fit chat + preview + workspace.                                                                                                                                       |
| `useWorkspaceCollapse.ts`  | Manages right-sider (workspace) collapse state. Listens to `WORKSPACE_TOGGLE_EVENT`/`WORKSPACE_HAS_FILES_EVENT`, persists manual toggles under `localStorage` key `workspace-preference-${preferenceKey}` (overrides auto-expand), forces collapse on mobile / conversation switch / workspace-disabled, and broadcasts state via `dispatchWorkspaceStateEvent`. |
| `useTitleRename.ts`        | Inline conversation-title edit state + submit. Calls optional `onRename` or `ipcBridge.conversation.update`, then `refreshConversationCache` + `emitter.emit('chat.history.refresh')`; shows Arco `Message` toasts with i18n keys.                                                                                                                               |
| `useConversationAgents.ts` | SWR-backed fetch of detected CLI execution engines (`fetchDetectedAgents` under `DETECTED_AGENTS_SWR_KEY`) plus preset assistants from `ipcBridge.assistants.list`. Filters via `isSupportedNewConversationAgent` and `enabled !== false`.                                                                                                                       |

## For AI Agents

- Renderer process: no Node.js APIs. Reach the main process only through `ipcBridge` (`@/common`); never import from `@process/*` here.
- All five files guard `typeof window === 'undefined'` for SSR safety — preserve those guards when editing.
- `useWorkspaceCollapse` has subtle priority rules: persisted `preferenceKey` toggle wins over file-driven auto-expand; temporary workspaces suppress auto-expand on the initial file seed (`detail.isInitial`). Read the header JSDoc before changing the `handleHasFiles` branch logic.
- `useLayoutConstraints` returns nothing — it only fires `useEffect`s that call the setters passed in. Keep dependency arrays exhaustive; the panel sizing depends on it.
- Layout pixel/ratio constants live in `../utils/layoutCalc` — import from there, don't hardcode.
- User-facing strings (rename toasts) must use `useTranslation`/i18n keys, not literals.

## Dependencies

### Internal

- `@/common` (`ipcBridge`), `@/renderer/pages/conversation/utils` (`layoutCalc`, `conversationCache`)
- `@/renderer/utils` (`emitter`, `ui/focus`, `workspace/workspaceEvents`, `model/agentTypes`, `model/agentTypeSupportPolicy`)
- `@/common/types/agent/assistantTypes`

### External

- `react`, `swr`, `react-i18next`, `@arco-design/web-react` (`Message`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
