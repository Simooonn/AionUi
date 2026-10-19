/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import type { GroupedHistoryResult, TimelineItem } from '@/renderer/pages/conversation/GroupedHistory/types';

const PINNED_WORKSPACE = '/pinned/project';
const PROJECT_A = '/a';
const PROJECT_B = '/b';

const mocks = vi.hoisted(() => ({
  // Stable identities: `t`, `navigate` and the context stubs land in memo and
  // effect dependency arrays, so a fresh function per render would churn.
  t: (key: string, options?: { count?: number }) => (options ? `${key}:${options.count}` : key),
  navigate: vi.fn(),
  noop: vi.fn(),
  never: () => false,
  cronJobsMap: { getJobStatus: () => undefined, markAsRead: vi.fn(), setActiveConversation: vi.fn() },
  layout: { isMobile: false, siderCollapsed: false },
  theme: { fontScale: 1 },
  staleWorkspaces: { stale: new Set<string>(), recheck: vi.fn(), checking: false },
  groupedHistory: { pinnedConversations: [], timelineSections: [] } as GroupedHistoryResult,
  conversations: [] as TChatConversation[],
  pinnedProjects: [] as string[],
  unreadIds: new Set<string>(),
  dragSpy: vi.fn(),
  paramsId: undefined as string | undefined,
  activityStatus: 'ok' as 'pending' | 'ok' | 'unavailable' | 'truncated',
  complete: true,
  hasLoadedOnce: true,
  electron: true,
  configSubscribers: new Set<(value: unknown) => void>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: mocks.paramsId }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({
    conversations: mocks.conversations,
    isConversationGenerating: mocks.never,
    isConversationWaitingConfirmation: mocks.never,
    hasCompletionUnread: (conversationId: string) => mocks.unreadIds.has(conversationId),
    clearCompletionUnread: mocks.noop,
    isManualUnread: mocks.never,
    markManualUnread: mocks.noop,
    clearManualUnread: mocks.noop,
    setActiveConversation: mocks.noop,
    groupedHistory: mocks.groupedHistory,
    hasLoadedOnce: mocks.hasLoadedOnce,
    activityStatus: mocks.activityStatus,
    isConversationListComplete: mocks.complete,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => mocks.layout,
}));

// AionModal reads the theme context, which throws outside ThemeProvider.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => mocks.theme,
}));

vi.mock('@/renderer/pages/cron', () => ({
  useCronJobsMap: () => mocks.cronJobsMap,
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/ace/useStaleWorkspaces', () => ({
  useStaleWorkspaces: () => mocks.staleWorkspaces,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { update: { invoke: vi.fn() }, remove: { invoke: vi.fn() } },
    sidebar: { archive: { invoke: vi.fn() } },
    terminal: { disposeByConversation: { invoke: vi.fn() } },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mocks.electron,
  isWebUI: () => !mocks.electron,
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    whenReady: () => Promise.resolve(),
    get: () => mocks.pinnedProjects,
    set: vi.fn(async (_key: string, value: string[]) => {
      mocks.pinnedProjects = value;
      mocks.configSubscribers.forEach((callback) => callback(value));
    }),
    subscribe: (_key: string, callback: (value: unknown) => void) => {
      mocks.configSubscribers.add(callback);
      return () => mocks.configSubscribers.delete(callback);
    },
  },
}));

// Default export: a bare object mock renders as "Element type is invalid".
// Honours `domIdPrefix`, so the recent section's copies (`rc-<id>`) never
// collide with the `#c-<id>` rows these cases look up.
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({ conversation, domIdPrefix }: { conversation: TChatConversation; domIdPrefix?: string }) => (
    <div id={(domIdPrefix ?? 'c-') + conversation.id} data-testid='conversation-row'>
      {conversation.id}
    </div>
  ),
}));

// Stands in for the real drag listeners, which @dnd-kit spreads as React props
// onto the whole pinned-project block.
vi.mock('@/renderer/pages/conversation/GroupedHistory/SortablePinnedProject', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='pinned-drag-root' onPointerDown={mocks.dragSpy}>
      {children}
    </div>
  ),
}));

import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory/index';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { configService } from '@/common/config/configService';

const conversationOf = (workspace: string, position: number) =>
  ({ id: `${workspace}/c-${position}`, name: `${workspace}/c-${position}` }) as TChatConversation;

const workspaceItem = (workspace: string, displayName: string, count: number): TimelineItem => ({
  type: 'workspace',
  time: 0,
  workspaceGroup: {
    workspace,
    display_name: displayName,
    conversations: Array.from({ length: count }, (_, index) => conversationOf(workspace, index + 1)),
  },
});

/**
 * Renders and flushes the pinned-projects seeding, which lands through
 * `configService.whenReady()` one microtask after mount.
 */
const renderHistory = async (props: Partial<React.ComponentProps<typeof WorkspaceGroupedHistory>> = {}) => {
  mocks.layout.siderCollapsed = props.collapsed ?? false;
  const utils = render(<WorkspaceGroupedHistory collapsed={false} batchMode={false} {...props} />);
  await act(async () => {});
  return utils;
};

/** The whole WorkspaceCollapse block of a project: header, badges and rows. */
const projectRoot = (displayName: string): HTMLElement => {
  const root = screen.getByText(displayName).closest('.workspace-collapse');
  if (!(root instanceof HTMLElement)) throw new Error(`project ${displayName} is not rendered`);
  return root;
};

const expandProject = (displayName: string) => fireEvent.click(screen.getByText(displayName));

const rowsOf = (displayName: string) => within(projectRoot(displayName)).queryAllByTestId('conversation-row');

/** Rows of every project; the recent section's `rc-` copies are not project rows. */
const projectRows = () => document.querySelectorAll('[data-testid="conversation-row"][id^="c-"]');

const moreRowOf = (displayName: string): HTMLElement | null =>
  within(projectRoot(displayName))
    .queryAllByRole('button')
    .find((element) => (element.getAttribute('aria-label') ?? '').startsWith('conversation.history.showMore')) ?? null;

const bulkButton = (action: 'expandAllProjects' | 'collapseAllProjects') =>
  screen.getByRole('button', { name: `conversation.history.${action}` });

beforeEach(() => {
  mocks.activityStatus = 'ok';
  mocks.complete = true;
  mocks.hasLoadedOnce = true;
  mocks.electron = true;
  mocks.paramsId = undefined;
  mocks.layout.siderCollapsed = false;
  mocks.configSubscribers.clear();
  vi.mocked(configService.set).mockClear();
  const items = [
    workspaceItem(PINNED_WORKSPACE, 'project-pinned', 6),
    workspaceItem(PROJECT_A, 'project-a', 12),
    workspaceItem(PROJECT_B, 'project-b', 5),
  ];
  mocks.groupedHistory = { pinnedConversations: [], timelineSections: [{ timeline: 'today', items }] };
  mocks.conversations = items.flatMap((item) => item.workspaceGroup?.conversations ?? []);
  mocks.pinnedProjects = [PINNED_WORKSPACE];
  mocks.unreadIds = new Set([`${PROJECT_A}/c-9`]);
  // The section-collapse state is persisted, so it leaks between cases.
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  mocks.dragSpy.mockClear();
  mocks.navigate.mockClear();
});

describe('GroupedHistory project paging (AC1)', () => {
  it('renders only the first 5 rows of an expanded 12-conversation project', async () => {
    await renderHistory();
    expandProject('project-a');

    expect(rowsOf('project-a')).toHaveLength(5);
    expect(document.getElementById(`c-${PROJECT_A}/c-5`)).toBeInTheDocument();
    expect(document.getElementById(`c-${PROJECT_A}/c-6`)).toBeNull();
    expect(moreRowOf('project-a')).toBeInTheDocument();
  });

  it('renders no more-row for a 5-conversation project', async () => {
    await renderHistory();
    expandProject('project-b');

    expect(rowsOf('project-b')).toHaveLength(5);
    expect(moreRowOf('project-b')).toBeNull();
  });
});

describe('GroupedHistory show-more row (AC2)', () => {
  it('shows 5 → 15 → 22 rows and drops the more-row at the end', async () => {
    const item = workspaceItem(PROJECT_A, 'project-a', 22);
    mocks.groupedHistory = { pinnedConversations: [], timelineSections: [{ timeline: 'today', items: [item] }] };
    await renderHistory();
    expandProject('project-a');
    expect(rowsOf('project-a')).toHaveLength(5);

    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(15);

    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(22);
    expect(moreRowOf('project-a')).toBeNull();
  });

  it('labels the more-row with the remaining count', async () => {
    await renderHistory();
    expandProject('project-a');

    const firstMoreRow = moreRowOf('project-a') as HTMLElement;
    expect(firstMoreRow).toHaveAttribute('aria-label', 'conversation.history.showMore:7');
    expect(firstMoreRow).toHaveTextContent('conversation.history.showMore:7');

    fireEvent.click(firstMoreRow);
    expect(moreRowOf('project-a')).toBeNull();
    expect(rowsOf('project-a')).toHaveLength(12);
  });

  it('keeps the more-row height at 34px', async () => {
    await renderHistory();
    expandProject('project-a');

    // Pixel-aligns with the 34px conversation rows above it.
    expect(moreRowOf('project-a')?.className).toContain('h-34px');
  });
});

describe('GroupedHistory collapse reset (AC3)', () => {
  it('resets the loaded count to 5 after collapsing and re-expanding', async () => {
    await renderHistory();
    expandProject('project-a');
    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(12);

    expandProject('project-a'); // collapse
    expect(rowsOf('project-a')).toHaveLength(0);

    expandProject('project-a'); // re-expand
    expect(rowsOf('project-a')).toHaveLength(5);
    expect(moreRowOf('project-a')).toHaveAttribute('aria-label', 'conversation.history.showMore:7');
  });
});

describe('GroupedHistory bulk expand/collapse buttons (AC6)', () => {
  it('renders both buttons next to the refresh button in the projects section label', async () => {
    await renderHistory();

    const expand = bulkButton('expandAllProjects');
    const collapse = bulkButton('collapseAllProjects');
    const refresh = screen.getByRole('button', { name: 'conversation.history.refreshProjects' });

    expect(expand.parentElement).toBe(refresh.parentElement);
    expect(collapse.parentElement).toBe(refresh.parentElement);
    // DOCUMENT_POSITION_FOLLOWING: expand, then collapse, then refresh.
    expect(expand.compareDocumentPosition(collapse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(collapse.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('expand-all opens every project, pinned included, at 5 rows each', async () => {
    await renderHistory();
    fireEvent.click(bulkButton('expandAllProjects'));

    expect(rowsOf('project-pinned')).toHaveLength(5);
    expect(rowsOf('project-a')).toHaveLength(5);
    expect(rowsOf('project-b')).toHaveLength(5);
    expect(moreRowOf('project-pinned')).toHaveAttribute('aria-label', 'conversation.history.showMore:1');
    expect(moreRowOf('project-b')).toBeNull();
  });

  it('collapse-all closes every project', async () => {
    await renderHistory();
    fireEvent.click(bulkButton('expandAllProjects'));
    expect(projectRows().length).toBeGreaterThan(0);

    fireEvent.click(bulkButton('collapseAllProjects'));
    expect(projectRows()).toHaveLength(0);
    expect(screen.getByText('project-a')).toBeInTheDocument();
  });

  it('puts no bulk buttons on the pinned-projects section label', async () => {
    await renderHistory();

    const label = screen.getByText('conversation.history.pinnedProjectsSection').closest('.sider-section-label');
    expect(label).not.toBeNull();
    const pinnedLabel = within(label as HTMLElement);
    expect(pinnedLabel.queryByRole('button', { name: 'conversation.history.expandAllProjects' })).toBeNull();
    expect(pinnedLabel.queryByRole('button', { name: 'conversation.history.collapseAllProjects' })).toBeNull();
    expect(pinnedLabel.queryByRole('button', { name: 'conversation.history.refreshProjects' })).toBeNull();
  });

  it('expand-all shrinks an already-paged project back to 5 rows', async () => {
    await renderHistory();
    expandProject('project-a');
    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(12);

    fireEvent.click(bulkButton('expandAllProjects'));
    expect(rowsOf('project-a')).toHaveLength(5);
  });

  it('hides the bulk buttons when every project is pinned', async () => {
    mocks.pinnedProjects = [PINNED_WORKSPACE, PROJECT_A, PROJECT_B];
    await renderHistory();

    expect(screen.queryByText('conversation.history.projectsSection')).toBeNull();
    expect(screen.queryByRole('button', { name: 'conversation.history.expandAllProjects' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'conversation.history.collapseAllProjects' })).toBeNull();
  });

  it('expand-all also reopens a collapsed projects section', async () => {
    await renderHistory();
    fireEvent.click(screen.getByText('conversation.history.projectsSection'));
    expect(screen.queryByText('project-a')).toBeNull();

    fireEvent.click(bulkButton('expandAllProjects'));
    expect(rowsOf('project-a')).toHaveLength(5);
  });
});

describe('GroupedHistory paging leaves the rest of the sidebar alone (AC8)', () => {
  it('keeps the folder badge driven by a conversation outside the loaded slice', async () => {
    await renderHistory();
    expandProject('project-a');

    expect(rowsOf('project-a')).toHaveLength(5);
    expect(document.getElementById(`c-${PROJECT_A}/c-9`)).toBeNull();
    expect(within(projectRoot('project-a')).getByTestId('folder-status-unread')).toBeInTheDocument();
  });

  it('keeps select-all counting every conversation, not just the rendered ones', async () => {
    await renderHistory({ batchMode: true });
    expandProject('project-a');
    expect(rowsOf('project-a')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.selectAll' }));
    expect(screen.getByText(`conversation.history.selectedCount:${mocks.conversations.length}`)).toBeInTheDocument();
  });

  it('stops the more-row pointerdown from reaching the pinned-project drag handler', async () => {
    await renderHistory();
    expect(screen.getByTestId('pinned-drag-root')).toBeInTheDocument();
    expandProject('project-pinned');

    fireEvent.pointerDown(moreRowOf('project-pinned') as HTMLElement, { pointerId: 1, button: 0 });
    expect(mocks.dragSpy).not.toHaveBeenCalled();
  });

  it("lets a normal row's pointerdown reach the pinned-project drag handler", async () => {
    await renderHistory();
    expandProject('project-pinned');

    fireEvent.pointerDown(rowsOf('project-pinned')[0], { pointerId: 1, button: 0 });
    expect(mocks.dragSpy).toHaveBeenCalled();
  });
});

const setProjectHistory = (items: TimelineItem[], pinnedConversations: TChatConversation[] = []) => {
  mocks.groupedHistory = { pinnedConversations, timelineSections: items.length ? [{ timeline: 'today', items }] : [] };
  mocks.conversations = [
    ...pinnedConversations,
    ...items.flatMap((item) => item.workspaceGroup?.conversations ?? (item.conversation ? [item.conversation] : [])),
  ];
};

const normalProjectItems = (count: number) =>
  Array.from({ length: count }, (_, i) => workspaceItem(`/normal-${i}`, `normal-${i}`, 1));
const normalProjectCount = () => screen.queryAllByText(/^normal-\d+$/).length;
const moreProjects = () => screen.queryByRole('button', { name: /^conversation.history.showMoreProjects:/ });

describe('ordinary project-list paging', () => {
  it('shows 5 -> 15 -> 22 normal projects plus every pinned project', async () => {
    const pins = Array.from({ length: 7 }, (_, i) => workspaceItem(`/pin-${i}`, `pin-${i}`, 1));
    mocks.pinnedProjects = pins.map((item) => item.workspaceGroup!.workspace);
    setProjectHistory([...pins, ...normalProjectItems(22)]);
    await renderHistory();
    expect(normalProjectCount()).toBe(5);
    expect(screen.getAllByText(/^pin-\d+$/)).toHaveLength(7);
    expect(moreProjects()).toHaveAttribute('aria-label', 'conversation.history.showMoreProjects:17');
    fireEvent.click(moreProjects()!);
    expect(normalProjectCount()).toBe(15);
    expect(moreProjects()).toHaveAttribute('aria-label', 'conversation.history.showMoreProjects:7');
    fireEvent.click(moreProjects()!);
    expect(normalProjectCount()).toBe(22);
    expect(moreProjects()).toBeNull();
  });

  it('resets the project window after section collapse without loading all on expand-all', async () => {
    setProjectHistory(normalProjectItems(22));
    await renderHistory();
    fireEvent.click(moreProjects()!);
    fireEvent.click(screen.getByText('conversation.history.projectsSection'));
    fireEvent.click(screen.getByText('conversation.history.projectsSection'));
    expect(normalProjectCount()).toBe(5);
    fireEvent.click(bulkButton('expandAllProjects'));
    expect(normalProjectCount()).toBe(5);
    expect(projectRows()).toHaveLength(5);
  });

  it('keeps all conversations selectable beyond the normal-project window', async () => {
    setProjectHistory(normalProjectItems(22));
    await renderHistory({ batchMode: true });
    fireEvent.click(bulkButton('expandAllProjects'));
    expect(projectRows()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.selectAll' }));
    expect(screen.getByText('conversation.history.selectedCount:22')).toBeInTheDocument();
  });

  it('temporarily shows all projects and their conversations in the narrow sider without growing the window', async () => {
    setProjectHistory(normalProjectItems(22));
    const { rerender } = await renderHistory();
    mocks.layout.siderCollapsed = true;
    rerender(<WorkspaceGroupedHistory collapsed />);
    expect(projectRows()).toHaveLength(22);
    expect(moreProjects()).toBeNull();
    mocks.layout.siderCollapsed = false;
    rerender(<WorkspaceGroupedHistory collapsed={false} />);
    expect(normalProjectCount()).toBe(5);
  });

  it('reveals both an off-page project and its off-page conversation before scrolling', async () => {
    setProjectHistory([...normalProjectItems(16), workspaceItem('/target', 'target-project', 22)]);
    localStorage.setItem('grouped-history-collapsed-sections', JSON.stringify(['recent', 'projects']));
    const { rerender } = await renderHistory();
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      mocks.paramsId = '/target/c-16';
      rerender(<WorkspaceGroupedHistory />);
      expect(document.getElementById('c-/target/c-16')).toBeInTheDocument();
      expect(rowsOf('target-project')).toHaveLength(22);
      await waitFor(() => expect(scroll).toHaveBeenCalled());
    } finally {
      scroll.mockRestore();
    }
  });

  it('reveals a cold-start pinned route after config hydration without reopening normal projects', async () => {
    mocks.pinnedProjects = ['/target'];
    setProjectHistory([...normalProjectItems(16), workspaceItem('/target', 'target-project', 22)]);
    localStorage.setItem(
      'grouped-history-collapsed-sections',
      JSON.stringify(['recent', 'projects', 'pinned-projects'])
    );
    mocks.paramsId = '/target/c-16';
    await renderHistory();
    expect(document.getElementById('c-/target/c-16')).toBeInTheDocument();
    expect(normalProjectCount()).toBe(0);
    expect(JSON.parse(localStorage.getItem('grouped-history-collapsed-sections') ?? '[]')).toEqual([
      'recent',
      'projects',
    ]);
  });

  it('keeps an empty project with individually pinned members without duplicating its row', async () => {
    const pinned = {
      ...conversationOf('/only-pin', 1),
      extra: { workspace: '/only-pin', custom_workspace: true, pinned: true },
    } as TChatConversation;
    mocks.pinnedProjects = ['/only-pin'];
    setProjectHistory([workspaceItem('/only-pin', 'only-pin-project', 0)], [pinned]);
    await renderHistory();
    expandProject('only-pin-project');
    expect(rowsOf('only-pin-project')).toHaveLength(0);
    expect(document.querySelectorAll('[id="c-/only-pin/c-1"]')).toHaveLength(1);
    expect(configService.set).not.toHaveBeenCalled();
  });
});

describe('DOM and Ctrl+Tab share visibility without sharing display order', () => {
  it.each([
    {
      narrow: false,
      folds: [] as string[],
      expected: [
        'solo/c-1',
        'free/c-1',
        '/normal-0/c-1',
        '/pin/c-1',
        '/normal-1/c-1',
        '/normal-2/c-1',
        '/normal-3/c-1',
        '/normal-4/c-1',
      ],
    },
    { narrow: false, folds: ['projects', 'conversations'], expected: ['solo/c-1', '/pin/c-1'] },
    {
      narrow: false,
      folds: ['pinned-projects', 'pinned'],
      expected: ['free/c-1', '/normal-0/c-1', '/normal-1/c-1', '/normal-2/c-1', '/normal-3/c-1', '/normal-4/c-1'],
    },
    {
      narrow: true,
      folds: [],
      expected: [
        'solo/c-1',
        'free/c-1',
        '/normal-0/c-1',
        '/pin/c-1',
        '/normal-1/c-1',
        '/normal-2/c-1',
        '/normal-3/c-1',
        '/normal-4/c-1',
        '/normal-5/c-1',
      ],
    },
    { narrow: true, folds: ['projects', 'pinned-projects'], expected: ['solo/c-1', 'free/c-1'] },
    {
      narrow: true,
      folds: ['pinned', 'conversations'],
      expected: [
        '/normal-0/c-1',
        '/pin/c-1',
        '/normal-1/c-1',
        '/normal-2/c-1',
        '/normal-3/c-1',
        '/normal-4/c-1',
        '/normal-5/c-1',
      ],
    },
    { narrow: true, folds: ['pinned', 'projects', 'pinned-projects', 'conversations'], expected: [] },
  ])('matches the canonical visible set with narrow=$narrow folds=$folds', async ({ narrow, folds, expected }) => {
    const normal = normalProjectItems(6);
    mocks.pinnedProjects = ['/pin'];
    setProjectHistory(
      [
        { type: 'conversation', time: 0, conversation: conversationOf('free', 1) },
        normal[0],
        workspaceItem('/pin', 'pin-project', 1),
        ...normal.slice(1),
      ],
      [conversationOf('solo', 1)]
    );
    localStorage.setItem('grouped-history-collapsed-sections', JSON.stringify(folds));
    await renderHistory({ collapsed: narrow });
    if (!narrow) {
      if (!folds.includes('projects')) for (let i = 0; i < 5; i++) expandProject(`normal-${i}`);
      if (!folds.includes('pinned-projects')) expandProject('pin-project');
    }
    const { result } = renderHook(() => useVisibleConversationIds());
    expect(result.current).toEqual(expected);
    const domIds = Array.from(projectRows(), (row) => row.id.slice(2));
    expect(new Set(domIds)).toEqual(new Set(expected));
    expect(new Set(domIds).size).toBe(domIds.length);
  });
});

describe('partial-list pin protection and status feedback', () => {
  it.each([
    ['pending', false],
    ['unavailable', false],
    ['unavailable', true],
    ['truncated', false],
    ['truncated', true],
    ['ok', false],
  ] as const)('preserves pins and their original order for status=%s complete=%s', async (status, complete) => {
    mocks.pinnedProjects = [PROJECT_B, PROJECT_A];
    const originalItems = [workspaceItem(PROJECT_A, 'project-a', 1), workspaceItem(PROJECT_B, 'project-b', 1)];
    setProjectHistory(originalItems);
    const { rerender } = await renderHistory();
    mocks.activityStatus = status;
    mocks.complete = complete;
    setProjectHistory([originalItems[0]]);
    rerender(<WorkspaceGroupedHistory />);
    expect(configService.set).not.toHaveBeenCalled();
    expect(mocks.pinnedProjects).toEqual([PROJECT_B, PROJECT_A]);
    mocks.activityStatus = 'ok';
    mocks.complete = true;
    setProjectHistory(originalItems);
    rerender(<WorkspaceGroupedHistory />);
    const names = Array.from(document.querySelectorAll('.workspace-collapse')).map((root) => root.textContent);
    expect(names[0]).toContain('project-b');
  });

  it('does not prune before the first confirmed load even if the other flags permit it', async () => {
    mocks.pinnedProjects = ['/missing'];
    mocks.hasLoadedOnce = false;
    await renderHistory();
    expect(configService.set).not.toHaveBeenCalled();
    expect(mocks.pinnedProjects).toEqual(['/missing']);
  });

  it('prunes only a genuinely absent project from a complete ok list', async () => {
    mocks.pinnedProjects = [PROJECT_A, '/gone'];
    await renderHistory();
    expect(configService.set).toHaveBeenCalledWith('sidebar.pinnedProjects', [PROJECT_A]);
    expect(mocks.pinnedProjects).toEqual([PROJECT_A]);
  });

  it('counts standalone pinned members and folded/off-page projects as existing', async () => {
    mocks.pinnedProjects = ['/only-pin', '/normal-21'];
    const pinned = {
      ...conversationOf('/only-pin', 1),
      extra: { workspace: '/only-pin', custom_workspace: true },
    } as TChatConversation;
    setProjectHistory(normalProjectItems(22), [pinned]);
    localStorage.setItem(
      'grouped-history-collapsed-sections',
      JSON.stringify(['projects', 'pinned-projects', 'pinned'])
    );
    await renderHistory();
    expect(configService.set).not.toHaveBeenCalled();
    expect(mocks.pinnedProjects).toEqual(['/only-pin', '/normal-21']);
  });

  it.each([
    ['truncated', 'incompleteList'],
    ['unavailable', 'activityUnavailable'],
  ] as const)('shows one persistent inline %s status even on an empty list', async (status, key) => {
    mocks.activityStatus = status;
    mocks.complete = false;
    setProjectHistory([]);
    const { rerender } = await renderHistory();
    rerender(<WorkspaceGroupedHistory />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(`conversation.history.${key}`);
  });

  it('shows both incomplete-list and unavailable-time feedback when both fail', async () => {
    mocks.activityStatus = 'unavailable';
    mocks.complete = false;
    setProjectHistory([]);
    await renderHistory();
    expect(screen.getByRole('status')).toHaveTextContent('conversation.history.incompleteList');
    expect(screen.getByRole('status')).toHaveTextContent('conversation.history.activityUnavailable');
  });

  it('does not show Electron-only activity failure feedback on Web', async () => {
    mocks.electron = false;
    mocks.activityStatus = 'unavailable';
    await renderHistory();
    expect(screen.queryByText('conversation.history.activityUnavailable')).toBeNull();
  });
});
