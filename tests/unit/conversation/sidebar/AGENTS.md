<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-13 | Updated: 2026-10-13 -->

# sidebar

## Purpose

Vitest unit tests for the grouped-history sidebar's project view: how many
conversations a project folder reveals (default one page of 5, grown one page at
a time), how revealing the active conversation opens its project and section,
how that state reaches the Ctrl+Tab visible-id list, and the bulk
expand-all / collapse-all actions. Nothing here is persisted, so a cold start
must show every project collapsed.

## Key Files

| File                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleConversationOrder.test.ts`           | node project. Exercises the paging primitives `PROJECT_PAGE_SIZE`, `getProjectLoadedCount`, `sliceLoadedConversations`, `loadedCountCovering` plus `buildVisibleConversationIds`: default slice of 5, the 5 → 10 → 12 walk of a 12-conversation project, the `loadedCountCovering` boundaries (index 4 → 5, 5 → 10, 12 → 15), collapsed workspaces contributing nothing, and the `siderCollapsed` full-list bypass.                                                                                                                                                                                                                                                                                             |
| `useConversationsProjectPaging.dom.test.tsx` | dom project. Drives `useConversations` and `useVisibleConversationIds` through `renderHook`: default/+5/collapse-reset counts, the reveal of an active conversation (count raised before `scrollIntoView`, other projects untouched, the pinned-projects section reopened), the snapshot channel round-trip, the startup-collapsed rule, and bulk expand/collapse.                                                                                                                                                                                                                                                                                                                                              |
| `groupedHistoryProjectPaging.dom.test.tsx`   | dom project. Renders `GroupedHistory/index.tsx`: the 5 rendered rows plus the "more" row, its remaining count and its 34px height, the 5 → 10 → 12 click-through, the collapse/re-expand reset, the two bulk buttons beside the refresh button in the "projects" section label (expand-all reopens a collapsed section and re-pages to 5, collapse-all closes everything, the pinned-projects label stays bare, both buttons vanish when every project is pinned), and that paging leaves the rest alone: the folder badge still comes from the full list, select-all still counts every conversation, and the "more" row's pointerdown never reaches the pinned-project drag handler while a plain row's does. |

## For AI Agents

- Renderer-only subjects: mock `@/renderer/hooks/context/ConversationHistoryContext`
  and `@/renderer/hooks/context/LayoutContext` rather than mounting the real
  providers, which would pull in `ipcBridge`.
- Mock `react-router-dom`'s `useParams` through a **mutable** `vi.hoisted` value: a
  statically returned conversation id makes the reveal effect expand its project
  and breaks every startup-collapsed case.
- `useWorkspaceExpansionState` keeps a module-level `lastSnapshot`, so reset it in
  `beforeEach` with `dispatchWorkspaceExpansionChange({ expandedWorkspaces: [], loadedCounts: {} })`
  and clear `localStorage` (the section-collapse key leaks between cases).
  `vi.resetModules()` does not help — it cannot rebind an already-imported module.
- Subscribers only read `lastSnapshot`; a bare `window.dispatchEvent` leaves the
  snapshot untouched, `getSnapshot` returns the same reference and React bails out.
  Always publish through `dispatchWorkspaceExpansionChange`.
- Do not use fake timers for the reveal timing: vitest's `toFake` includes
  `requestAnimationFrame`, which replaces the setTimeout-based shim in
  `tests/vitest.dom.setup.ts` and stalls the double RAF. Spy on
  `Element.prototype.scrollIntoView`, pre-append a `#c-<id>` node and
  `await waitFor(...)` instead.
- The file name must end in `.dom.test.tsx` for a jsdom test; a plain
  `*.test.tsx` matches no vitest project and is silently skipped.
- Rendering `GroupedHistory/index.tsx` additionally needs
  `@/renderer/hooks/context/ThemeContext` mocked — its always-mounted `AionModal`
  calls `useThemeContext()`, which throws outside `ThemeProvider` — and
  `ConversationRow` / `SortablePinnedProject` mocked as `{ default: … }`
  (a bare object mock renders as "Element type is invalid").
- Pinned projects are seeded one microtask after mount through
  `configService.whenReady()`, so flush with `await act(async () => {})` after
  `render` or the pinned-projects section is still absent.

## Dependencies

### Internal

- `@/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder`
- `@/renderer/pages/conversation/GroupedHistory/index` (`WorkspaceGroupedHistory`)
- `@/renderer/pages/conversation/GroupedHistory/hooks/useConversations`
- `@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds`
- `@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState`
- `@/renderer/pages/conversation/GroupedHistory/types` (`GroupedHistoryResult`, `TimelineItem`), `@/common/config/storage` (`TChatConversation`)

### External

- `vitest`, `@testing-library/react`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
