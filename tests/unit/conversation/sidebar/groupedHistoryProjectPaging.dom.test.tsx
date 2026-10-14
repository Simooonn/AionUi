/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: undefined }),
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
    hasLoadedOnce: true,
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

vi.mock('@/common/config/configService', () => ({
  configService: {
    whenReady: () => Promise.resolve(),
    get: () => mocks.pinnedProjects,
    set: vi.fn(),
    subscribe: () => () => {},
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
  it('shows 5 → 10 → 12 rows and drops the more-row at the end', async () => {
    await renderHistory();
    expandProject('project-a');
    expect(rowsOf('project-a')).toHaveLength(5);

    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(10);

    fireEvent.click(moreRowOf('project-a') as HTMLElement);
    expect(rowsOf('project-a')).toHaveLength(12);
    expect(moreRowOf('project-a')).toBeNull();
  });

  it('labels the more-row with the remaining count', async () => {
    await renderHistory();
    expandProject('project-a');

    const firstMoreRow = moreRowOf('project-a') as HTMLElement;
    expect(firstMoreRow).toHaveAttribute('aria-label', 'conversation.history.showMore:7');
    expect(firstMoreRow).toHaveTextContent('conversation.history.showMore:7');

    fireEvent.click(firstMoreRow);
    expect(moreRowOf('project-a')).toHaveAttribute('aria-label', 'conversation.history.showMore:2');
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
    expect(rowsOf('project-a')).toHaveLength(10);

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
    expect(rowsOf('project-a')).toHaveLength(10);

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
