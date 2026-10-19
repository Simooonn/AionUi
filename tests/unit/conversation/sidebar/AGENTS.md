<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-13 | Updated: 2026-10-14 -->

# sidebar

## Purpose

Vitest unit tests for the grouped-history sidebar's project view: how many
conversations a project folder reveals (default one page of 5, grown one page at
by increments of 10), how revealing the active conversation opens its project and section,
how that state reaches the Ctrl+Tab visible-id list, and the bulk
expand-all / collapse-all actions. Nothing here is persisted, so a cold start
must show every project collapsed. Also covers the "recent conversations"
section: which conversations it lists and in what order, its paging, its
visibility rules, its `rc-` row copies (own DOM id, own dropdown key, project
label) and how revealing a conversation it renders avoids expanding projects.

## Key Files

| File                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleConversationOrder.test.ts`           | node project. Exercises the paging primitives `INITIAL_PAGE_SIZE` / `PAGE_STEP`, `getProjectLoadedCount`, `sliceLoadedConversations`, `loadedCountCovering` plus `buildVisibleConversationIds`: default slice of 5, the 5 → 15 → 22 walk of a 22-conversation project, the `loadedCountCovering` boundaries (index 4 → 5, 5 → 15, 14 → 15, 15 → 25), collapsed workspaces contributing nothing, and the `siderCollapsed` full-list bypass.                                                                                                                                                                                                                                                                      |
| `useConversationsProjectPaging.dom.test.tsx` | dom project. Drives `useConversations` and `useVisibleConversationIds` through `renderHook`: default/+10/collapse-reset counts, the reveal of an active conversation (count raised before `scrollIntoView`, other projects untouched, the pinned-projects section reopened), the snapshot channel round-trip, the startup-collapsed rule, and bulk expand/collapse.                                                                                                                                                                                                                                                                                                                                             |
| `groupedHistoryProjectPaging.dom.test.tsx`   | dom project. Renders `GroupedHistory/index.tsx`: the 5 rendered rows plus the "more" row, its remaining count and its 34px height, the 5 → 15 → 22 click-through, the collapse/re-expand reset, the two bulk buttons beside the refresh button in the "projects" section label (expand-all reopens a collapsed section and re-pages to 5, collapse-all closes everything, the pinned-projects label stays bare, both buttons vanish when every project is pinned), and that paging leaves the rest alone: the folder badge still comes from the full list, select-all still counts every conversation, and the "more" row's pointerdown never reaches the pinned-project drag handler while a plain row's does. |
| `recentConversations.test.ts`                | node project. `buildRecentConversations` / `getProjectWorkspace`: three-source merge newest first (`created_at` fallback, stable ties), stale exclusion for group members (judged by the group workspace, fixtures carry no `extra`) and for pinned conversations, label resolution (group name / pinned via the group map / path fallback / none for free rows), empty input.                                                                                                                                                                                                                                                                                                                                  |
| `useConversationsRecentSection.dom.test.tsx` | dom project. `useConversations` recent paging (5 → 15 → 25, reset on every `toggleSection('recent')`, fold persisted) and the three reveal paths with hand-built DOM: `recent` (only an `rc-` row, zero rect: scroll it, expand nothing), `none` (a row fully inside a mocked `overflow-y:auto` viewport), `legacy` (own row rendered but out of view), plus the no-`rc-` control.                                                                                                                                                                                                                                                                                                                              |
| `conversationRowRecentProps.dom.test.tsx`    | dom project. Real `ConversationRow`: `domIdPrefix` (default `c-`), the `projectLabel` span and its `group-hover:me-16px` / `me-16px` margin classes, and an unchanged name container without a label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `groupedHistoryRecentSection.dom.test.tsx`   | dom project. Renders `GroupedHistory/index.tsx`: section placement (pinned projects → recent → Team slot → projects), 5 → 15 → 22 paging with a flush 34px more-row, fold reset, hidden in the narrow sider / batch mode / when every row is stale, the stale-check list including pinned conversations' projects, `rc-` ids with `#c-<id>` still unique, labels, dropdown opening only on its own row, and the whole-component reveal (recent path with the project left collapsed; project expanded when the section is folded).                                                                                                                                                                              |

## For AI Agents

- Renderer-only subjects: mock `@/renderer/hooks/context/ConversationHistoryContext`
  and `@/renderer/hooks/context/LayoutContext` rather than mounting the real
  providers, which would pull in `ipcBridge`.
- Mock `react-router-dom`'s `useParams` through a **mutable** `vi.hoisted` value: a
  statically returned conversation id makes the reveal effect expand its project
  and breaks every startup-collapsed case.
- `useWorkspaceExpansionState` keeps a module-level `lastSnapshot`, so reset it in
  `beforeEach` with `dispatchWorkspaceExpansionChange({ expandedWorkspaces: [], loadedCounts: {}, collapsedSections: [], pinnedProjects: [], projectListLoadedCount: 5 })`
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
- The recent section renders a second copy of up to 5 rows above the projects.
  Row mocks must honour `domIdPrefix` (`id={(domIdPrefix ?? 'c-') + id}`) or
  `#c-<id>` lookups hit the recent copy, and must not render `projectLabel` as
  text or `getByText('<project name>')` matches several elements. Global row
  counts now include the recent rows — scope them (e.g. `[id^="c-"]`).
- Reveal cases need a mutable `useParams` and a `rerender`; jsdom rects are all
  zero, which `isFullyVisible` treats as out of view. Mock
  `getBoundingClientRect` on the row and on an `overflow-y:auto` ancestor to
  exercise the in-view path.
- Project paging cases also cover ordinary-project 5/+10 windows, pinned-slot exclusion, off-page reveal, cold-start pin hydration, canonical Ctrl+Tab arrays versus DOM sets, narrow/fold combinations, and incomplete-list pin preservation. Status feedback is Electron-only; do not query every `role=status` because dnd-kit owns live-region status nodes too.
- Pinned projects are seeded one microtask after mount through
  `configService.whenReady()`, so flush with `await act(async () => {})` after
  `render` or the pinned-projects section is still absent.

## Dependencies

### Internal

- `@/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder`
- `@/renderer/pages/conversation/GroupedHistory/utils/recentConversations`
- `@/renderer/pages/conversation/GroupedHistory/ConversationRow` (real component, `conversationRowRecentProps` only)
- `@/renderer/pages/conversation/GroupedHistory/index` (`WorkspaceGroupedHistory`)
- `@/renderer/pages/conversation/GroupedHistory/hooks/useConversations`
- `@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds`
- `@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState`
- `@/renderer/pages/conversation/GroupedHistory/types` (`GroupedHistoryResult`, `TimelineItem`), `@/common/config/storage` (`TChatConversation`)

### External

- `vitest`, `@testing-library/react`, `react`

<!-- MANUAL: notes below this line are preserved on regeneration -->
