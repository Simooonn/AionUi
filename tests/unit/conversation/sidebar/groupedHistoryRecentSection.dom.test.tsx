/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import type { GroupedHistoryResult, TimelineItem } from '@/renderer/pages/conversation/GroupedHistory/types';

const PROJECT_A = '/a';
const PINNED_WORKSPACE = '/pinned/project';
const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';

const mocks = vi.hoisted(() => ({
  // Stable identities: `t`, `navigate` and the context stubs land in memo and
  // effect dependency arrays, so a fresh function per render would churn.
  t: (key: string, options?: { count?: number }) => (options ? `${key}:${options.count}` : key),
  navigate: vi.fn(),
  noop: vi.fn(),
  never: () => false,
  // Mutable so a case can switch the active conversation route and rerender.
  paramsId: undefined as string | undefined,
  cronJobsMap: { getJobStatus: () => undefined, markAsRead: vi.fn(), setActiveConversation: vi.fn() },
  layout: { isMobile: false, siderCollapsed: false },
  theme: { fontScale: 1 },
  staleWorkspaces: { stale: new Set<string>(), recheck: vi.fn(), checking: false },
  // Records the workspace list the sidebar asks to be checked.
  staleCheck: vi.fn(),
  groupedHistory: { pinnedConversations: [], timelineSections: [] } as GroupedHistoryResult,
  conversations: [] as TChatConversation[],
  pinnedProjects: [] as string[],
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
    hasCompletionUnread: mocks.never,
    clearCompletionUnread: mocks.noop,
    isManualUnread: mocks.never,
    markManualUnread: mocks.noop,
    clearManualUnread: mocks.noop,
    setActiveConversation: mocks.noop,
    groupedHistory: mocks.groupedHistory,
    hasLoadedOnce: true,
    activityStatus: 'ok',
    isConversationListComplete: true,
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
  useStaleWorkspaces: (workspaces: string[]) => {
    mocks.staleCheck(workspaces);
    return mocks.staleWorkspaces;
  },
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

// Exposes the props under test as data attributes; the project label is NOT
// rendered as text, or `getByText('<project name>')` would match the rows too.
// Default export: a bare object mock renders as "Element type is invalid".
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({
    conversation,
    domIdPrefix,
    projectLabel,
    menuVisible,
    dimIcon,
    onOpenMenu,
  }: {
    conversation: TChatConversation;
    domIdPrefix?: string;
    projectLabel?: string;
    menuVisible: boolean;
    dimIcon?: boolean;
    onOpenMenu: (conversation: TChatConversation) => void;
  }) => (
    <div
      id={(domIdPrefix ?? 'c-') + conversation.id}
      data-testid='conversation-row'
      data-project-label={projectLabel ?? ''}
      data-menu-visible={String(menuVisible)}
      data-dim-icon={String(Boolean(dimIcon))}
      onContextMenu={() => onOpenMenu(conversation)}
    >
      {conversation.id}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/SortablePinnedProject', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory/index';

/** Position 1 is the newest conversation of the workspace. */
const conversationOf = (workspace: string, position: number, newest = 1000) =>
  ({
    id: `${workspace}/c-${position}`,
    name: `${workspace}/c-${position}`,
    modified_at: newest - position,
  }) as TChatConversation;

const workspaceItem = (workspace: string, displayName: string, count: number, newest = 1000): TimelineItem => ({
  type: 'workspace',
  time: 0,
  workspaceGroup: {
    workspace,
    display_name: displayName,
    conversations: Array.from({ length: count }, (_, index) => conversationOf(workspace, index + 1, newest)),
  },
});

const setHistory = (items: TimelineItem[], pinnedConversations: TChatConversation[] = []) => {
  mocks.groupedHistory = { pinnedConversations, timelineSections: items.length ? [{ timeline: 'today', items }] : [] };
  mocks.conversations = [
    ...pinnedConversations,
    ...items.flatMap((item) =>
      item.workspaceGroup ? item.workspaceGroup.conversations : item.conversation ? [item.conversation] : []
    ),
  ];
};

const historyElement = (props: Partial<React.ComponentProps<typeof WorkspaceGroupedHistory>> = {}) => (
  <WorkspaceGroupedHistory collapsed={false} batchMode={false} {...props} />
);

/** Renders and flushes the pinned-projects seeding, which lands through `configService.whenReady()`. */
const renderHistory = async (props: Partial<React.ComponentProps<typeof WorkspaceGroupedHistory>> = {}) => {
  const utils = render(historyElement(props));
  await act(async () => {});
  return utils;
};

const recentSection = () => screen.queryByTestId('recent-conversations-section');

const recentRows = (): HTMLElement[] => {
  const section = recentSection();
  return section ? within(section).queryAllByTestId('conversation-row') : [];
};

const recentRowIds = () => recentRows().map((row) => row.id);

const recentMoreRow = (): HTMLElement | null => {
  const section = recentSection();
  if (!section) return null;
  return (
    within(section)
      .queryAllByRole('button')
      .find((element) => (element.getAttribute('aria-label') ?? '').startsWith('conversation.history.showMore')) ?? null
  );
};

const projectRoot = (displayName: string): HTMLElement => {
  const root = screen.getByText(displayName).closest('.workspace-collapse');
  if (!(root instanceof HTMLElement)) throw new Error(`project ${displayName} is not rendered`);
  return root;
};

const rowsOf = (displayName: string) => within(projectRoot(displayName)).queryAllByTestId('conversation-row');

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is not rendered`);
  return element;
};

/** Ids of the elements `scrollIntoView` was called on, in call order. */
let scrolledIds: string[] = [];
let scrollSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  setHistory([workspaceItem(PROJECT_A, 'project-a', 12)]);
  mocks.pinnedProjects = [];
  mocks.paramsId = undefined;
  mocks.staleWorkspaces = { stale: new Set<string>(), recheck: vi.fn(), checking: false };
  // The section-collapse state is persisted, so it leaks between cases.
  localStorage.clear();
  scrolledIds = [];
  scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    scrolledIds.push(this.id);
  });
});

afterEach(() => {
  cleanup();
  scrollSpy?.mockRestore();
  scrollSpy = null;
  mocks.navigate.mockClear();
  mocks.staleCheck.mockClear();
});

describe('GroupedHistory recent section placement (AC1)', () => {
  it('sits after the pinned projects and before the Team slot and the projects', async () => {
    setHistory([workspaceItem(PINNED_WORKSPACE, 'project-pinned', 2, 2000), workspaceItem(PROJECT_A, 'project-a', 12)]);
    mocks.pinnedProjects = [PINNED_WORKSPACE];
    await renderHistory({ afterPinnedContent: <div data-testid='after-pinned' /> });

    const order = [
      screen.getByText('conversation.history.pinnedProjectsSection'),
      screen.getByText('conversation.history.recentSection'),
      screen.getByTestId('after-pinned'),
      screen.getByText('conversation.history.projectsSection'),
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('GroupedHistory recent section paging (AC4/AC5)', () => {
  it('shows the 5 newest rows, then 15, then all 22, with a flush 34px more-row', async () => {
    setHistory([workspaceItem(PROJECT_A, 'project-a', 22)]);
    await renderHistory();

    expect(recentRowIds()).toEqual([1, 2, 3, 4, 5].map((position) => `rc-${PROJECT_A}/c-${position}`));
    const more = recentMoreRow();
    expect(more).toHaveAttribute('aria-label', 'conversation.history.showMore:17');
    expect(more).toHaveClass('h-34px', 'ps-10px');
    expect(more).not.toHaveClass('ps-34px');

    fireEvent.click(more as HTMLElement);
    expect(recentRows()).toHaveLength(15);
    expect(recentMoreRow()).toHaveAttribute('aria-label', 'conversation.history.showMore:7');

    fireEvent.click(recentMoreRow() as HTMLElement);
    expect(recentRows()).toHaveLength(22);
    expect(recentMoreRow()).toBeNull();
  });

  it('exhausts a 12-conversation list with one increment', async () => {
    await renderHistory();
    fireEvent.click(recentMoreRow() as HTMLElement);
    expect(recentRows()).toHaveLength(12);
    expect(recentMoreRow()).toBeNull();
  });

  it('renders no more-row when there are 5 conversations or fewer', async () => {
    setHistory([workspaceItem('/b', 'project-b', 3)]);
    await renderHistory();

    expect(recentRows()).toHaveLength(3);
    expect(recentMoreRow()).toBeNull();
  });

  it('goes back to one page after folding and unfolding the section', async () => {
    await renderHistory();
    fireEvent.click(recentMoreRow() as HTMLElement);
    expect(recentRows()).toHaveLength(12);

    fireEvent.click(screen.getByText('conversation.history.recentSection'));
    expect(recentRows()).toHaveLength(0);

    fireEvent.click(screen.getByText('conversation.history.recentSection'));
    expect(recentRows()).toHaveLength(5);
  });
});

describe('GroupedHistory recent section visibility (AC2/AC6)', () => {
  it('is not rendered in the narrow sider', async () => {
    await renderHistory({ collapsed: true });
    expect(recentSection()).toBeNull();
  });

  it('is not rendered in batch mode', async () => {
    await renderHistory({ batchMode: true });
    expect(recentSection()).toBeNull();
  });

  it('is not rendered when every conversation belongs to a stale project, while the project stays', async () => {
    mocks.staleWorkspaces = { stale: new Set([PROJECT_A]), recheck: vi.fn(), checking: false };
    await renderHistory();

    expect(recentSection()).toBeNull();
    expect(screen.getByText('project-a')).toBeInTheDocument();
  });

  it('asks the stale check about pinned conversations whose project has no group', async () => {
    const pinned = {
      id: 'pinned-1',
      name: 'pinned-1',
      modified_at: 5000,
      extra: { workspace: '/elsewhere', custom_workspace: true },
    } as unknown as TChatConversation;
    setHistory([workspaceItem(PROJECT_A, 'project-a', 2)], [pinned]);
    await renderHistory();

    expect(mocks.staleCheck).toHaveBeenLastCalledWith(expect.arrayContaining([PROJECT_A, '/elsewhere']));
  });
});

describe('GroupedHistory recent rows (AC7/AC8)', () => {
  it('uses the rc- prefix, no indent, and keeps #c-<id> unique', async () => {
    await renderHistory();
    fireEvent.click(screen.getByText('project-a'));

    const target = `${PROJECT_A}/c-1`;
    expect(document.querySelectorAll(`[id="c-${target}"]`)).toHaveLength(1);
    expect(document.querySelectorAll(`[id="rc-${target}"]`)).toHaveLength(1);
    expect(byId(`rc-${target}`)).toHaveAttribute('data-dim-icon', 'false');
    expect(byId(`c-${target}`)).toHaveAttribute('data-dim-icon', 'true');
  });

  it('labels project rows with the project name and leaves free conversations bare', async () => {
    const free = { id: 'free-1', name: 'free-1', modified_at: 5000 } as TChatConversation;
    setHistory([workspaceItem(PROJECT_A, 'project-a', 3), { type: 'conversation', time: 0, conversation: free }]);
    await renderHistory();

    expect(byId('rc-free-1')).toHaveAttribute('data-project-label', '');
    expect(byId(`rc-${PROJECT_A}/c-1`)).toHaveAttribute('data-project-label', 'project-a');
  });

  it('opens the dropdown only on the row it was opened from', async () => {
    await renderHistory();
    fireEvent.click(screen.getByText('project-a'));
    const target = `${PROJECT_A}/c-1`;

    fireEvent.contextMenu(byId(`rc-${target}`));
    expect(byId(`rc-${target}`)).toHaveAttribute('data-menu-visible', 'true');
    expect(byId(`c-${target}`)).toHaveAttribute('data-menu-visible', 'false');

    fireEvent.contextMenu(byId(`c-${target}`));
    expect(byId(`c-${target}`)).toHaveAttribute('data-menu-visible', 'true');
    expect(byId(`rc-${target}`)).toHaveAttribute('data-menu-visible', 'false');
  });
});

describe('GroupedHistory reveal through the recent section (AC9)', () => {
  it('scrolls to the recent row and leaves the collapsed project alone', async () => {
    const utils = await renderHistory();
    const target = `${PROJECT_A}/c-1`;

    mocks.paramsId = target;
    utils.rerender(historyElement());

    await waitFor(() => expect(scrolledIds).toEqual([`rc-${target}`]));
    expect(rowsOf('project-a')).toHaveLength(0);
    expect(document.getElementById(`c-${target}`)).toBeNull();
  });

  it('falls back to expanding the project when the recent section is folded', async () => {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(['recent']));
    const utils = await renderHistory();
    const target = `${PROJECT_A}/c-1`;

    mocks.paramsId = target;
    utils.rerender(historyElement());

    await waitFor(() => expect(scrolledIds).toEqual([`c-${target}`]));
    expect(rowsOf('project-a')).toHaveLength(5);
    expect(recentRows()).toHaveLength(0);
  });
});
