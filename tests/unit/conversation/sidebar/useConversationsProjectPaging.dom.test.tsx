/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import type { GroupedHistoryResult, TimelineItem } from '@/renderer/pages/conversation/GroupedHistory/types';

const mocks = vi.hoisted(() => ({
  // Mutable so a case can decide whether a conversation route is active, and
  // can let the id arrive after the first render.
  paramsId: undefined as string | undefined,
  groupedHistory: { pinnedConversations: [], timelineSections: [] } as GroupedHistoryResult,
  // Stable identities: these land in the reveal effect's dependency array.
  clearCompletionUnread: vi.fn(),
  clearManualUnread: vi.fn(),
  setActiveConversation: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: mocks.paramsId }),
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({
    conversations: [],
    isConversationGenerating: () => false,
    isConversationWaitingConfirmation: () => false,
    hasCompletionUnread: () => false,
    clearCompletionUnread: mocks.clearCompletionUnread,
    isManualUnread: () => false,
    markManualUnread: vi.fn(),
    clearManualUnread: mocks.clearManualUnread,
    setActiveConversation: mocks.setActiveConversation,
    groupedHistory: mocks.groupedHistory,
    hasLoadedOnce: true,
    activityStatus: 'ok',
    isConversationListComplete: true,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false, siderCollapsed: false, setSiderCollapsed: vi.fn() }),
}));

import { useConversations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversations';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import {
  dispatchWorkspaceExpansionChange,
  WORKSPACE_EXPANSION_EVENT,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState';
import { getProjectLoadedCount } from '@/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder';

const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';

const conversationId = (workspace: string, position: number) => `${workspace}/c-${position}`;

const workspaceItem = (workspace: string, count: number): TimelineItem => ({
  type: 'workspace',
  time: 0,
  workspaceGroup: {
    workspace,
    display_name: workspace,
    conversations: Array.from(
      { length: count },
      (_, index) => ({ id: conversationId(workspace, index + 1) }) as TChatConversation
    ),
  },
});

const setHistory = (items: TimelineItem[]) => {
  mocks.groupedHistory = { pinnedConversations: [], timelineSections: [{ timeline: 'today', items }] };
};

let scrollSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  mocks.paramsId = undefined;
  setHistory([]);
  localStorage.clear();
  // `lastSnapshot` is module-level mutable state shared by every case.
  dispatchWorkspaceExpansionChange({
    collapsedSections: [],
    pinnedProjects: [],
    projectListLoadedCount: 5,
    expandedWorkspaces: [],
    loadedCounts: {},
  });
});

afterEach(() => {
  cleanup();
  scrollSpy?.mockRestore();
  scrollSpy = null;
  document.body.innerHTML = '';
  mocks.clearCompletionUnread.mockClear();
  mocks.clearManualUnread.mockClear();
  mocks.setActiveConversation.mockClear();
});

describe('useConversations per-project paging', () => {
  it('starts every project at the default page size (AC1)', () => {
    setHistory([workspaceItem('/a', 12)]);
    const { result } = renderHook(() => useConversations());

    expect(result.current.loadedCounts).toEqual({});
    expect(getProjectLoadedCount(result.current.loadedCounts, '/a')).toBe(5);
  });

  it('advances a project by one page per show-more call (AC2)', () => {
    setHistory([workspaceItem('/a', 12)]);
    const { result } = renderHook(() => useConversations());

    act(() => result.current.handleShowMoreConversations('/a'));
    expect(result.current.loadedCounts['/a']).toBe(15);

    act(() => result.current.handleShowMoreConversations('/a'));
    expect(result.current.loadedCounts['/a']).toBe(25);
  });

  it('resets the loaded count to 5 after collapsing and re-expanding (AC3)', () => {
    setHistory([workspaceItem('/a', 12)]);
    const { result } = renderHook(() => useConversations());

    act(() => result.current.handleToggleWorkspace('/a'));
    act(() => result.current.handleShowMoreConversations('/a'));
    expect(result.current.loadedCounts['/a']).toBe(15);

    act(() => result.current.handleToggleWorkspace('/a'));
    expect(result.current.expandedWorkspaces).toEqual([]);
    expect(getProjectLoadedCount(result.current.loadedCounts, '/a')).toBe(5);

    act(() => result.current.handleToggleWorkspace('/a'));
    expect(result.current.expandedWorkspaces).toEqual(['/a']);
    expect(getProjectLoadedCount(result.current.loadedCounts, '/a')).toBe(5);
  });
});

describe('useConversations reveal of the active conversation (AC4)', () => {
  it('advances the loaded count to the smallest 5 + 10n covering the active conversation', () => {
    setHistory([workspaceItem('/ws', 20)]);
    mocks.paramsId = conversationId('/ws', 13); // index 12

    const { result } = renderHook(() => useConversations());

    expect(result.current.expandedWorkspaces).toEqual(['/ws']);
    expect(result.current.loadedCounts['/ws']).toBe(15);
  });

  it('leaves other projects at the default count', () => {
    setHistory([workspaceItem('/ws', 20), workspaceItem('/other', 20)]);
    mocks.paramsId = conversationId('/ws', 13);

    const { result } = renderHook(() => useConversations());

    expect(result.current.loadedCounts).toEqual({ '/ws': 15 });
    expect(getProjectLoadedCount(result.current.loadedCounts, '/other')).toBe(5);
  });

  it('advances the count before scrollIntoView fires', async () => {
    setHistory([workspaceItem('/ws', 20)]);
    const targetId = conversationId('/ws', 13);
    mocks.paramsId = targetId;

    scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const target = document.createElement('div');
    target.id = 'c-' + targetId;
    document.body.appendChild(target);

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    expect(result.current.loadedCounts['/ws']).toBe(15);
  });

  it('also expands the pinned-projects section when the target lives in a pinned project', () => {
    // Only the pinned section is collapsed, so a guard that checks 'projects'
    // alone would bail out and leave the pinned section shut.
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(['pinned-projects', 'projects']));
    setHistory([workspaceItem('/ws', 3)]);
    mocks.paramsId = conversationId('/ws', 2);
    const pinnedProjects = ['/ws'];
    const { result } = renderHook(() => useConversations({ pinnedProjects }));

    expect(result.current.collapsedSections.has('pinned-projects')).toBe(false);
    expect(result.current.collapsedSections.has('projects')).toBe(true);
  });
});

describe('workspace-view snapshot channel (AC5)', () => {
  it('round-trips a show-more click from useConversations to useVisibleConversationIds', () => {
    setHistory([workspaceItem('/a', 12)]);

    const owner = renderHook(() => useConversations());
    const subscriber = renderHook(() => useVisibleConversationIds());

    act(() => owner.result.current.handleToggleWorkspace('/a'));
    expect(subscriber.result.current).toHaveLength(5);

    act(() => owner.result.current.handleShowMoreConversations('/a'));
    expect(subscriber.result.current).toHaveLength(12);
  });

  it('reacts to a dispatched workspace-view snapshot', () => {
    setHistory([workspaceItem('/a', 12)]);

    const { result } = renderHook(() => useVisibleConversationIds());

    act(() =>
      dispatchWorkspaceExpansionChange({
        collapsedSections: [],
        pinnedProjects: [],
        projectListLoadedCount: 5,
        expandedWorkspaces: ['/a'],
        loadedCounts: { '/a': 10 },
      })
    );
    expect(result.current).toHaveLength(10);

    act(() =>
      dispatchWorkspaceExpansionChange({
        collapsedSections: [],
        pinnedProjects: [],
        projectListLoadedCount: 5,
        expandedWorkspaces: ['/a'],
        loadedCounts: {},
      })
    );
    expect(result.current).toHaveLength(5);
  });

  it('dispatches the change event without a detail payload', () => {
    const listener = vi.fn();
    window.addEventListener(WORKSPACE_EXPANSION_EVENT, listener);
    try {
      dispatchWorkspaceExpansionChange({
        collapsedSections: [],
        pinnedProjects: [],
        projectListLoadedCount: 5,
        expandedWorkspaces: ['/a'],
        loadedCounts: { '/a': 10 },
      });
    } finally {
      window.removeEventListener(WORKSPACE_EXPANSION_EVENT, listener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBeUndefined();
  });
});

describe('startup state (AC7)', () => {
  it('starts with every project collapsed even when localStorage holds a previous expansion', () => {
    localStorage.setItem('aionui_workspace_expansion', JSON.stringify(['/a', '/b']));
    setHistory([workspaceItem('/a', 12), workspaceItem('/b', 12)]);

    const { result } = renderHook(() => useConversations());

    expect(result.current.expandedWorkspaces).toEqual([]);
    expect(result.current.loadedCounts).toEqual({});
  });

  it('never auto-expands when the conversation list arrives', () => {
    const { result, rerender } = renderHook(() => useConversations());
    expect(result.current.expandedWorkspaces).toEqual([]);

    setHistory([workspaceItem('/a', 12), workspaceItem('/b', 3)]);
    rerender();

    expect(result.current.expandedWorkspaces).toEqual([]);
  });

  it('keeps useVisibleConversationIds collapsed on a cold start with a stale localStorage value', () => {
    localStorage.setItem('aionui_workspace_expansion', JSON.stringify(['/a']));
    setHistory([workspaceItem('/a', 12)]);

    const { result } = renderHook(() => useVisibleConversationIds());

    expect(result.current).toEqual([]);
  });
});

describe('bulk expand / collapse (AC6)', () => {
  it('expand-all opens every project at the default page size and reopens both sections', () => {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(['projects', 'pinned-projects']));
    setHistory([workspaceItem('/a', 20), workspaceItem('/b', 3)]);

    const { result } = renderHook(() => useConversations());

    act(() => result.current.handleShowMoreConversations('/a'));
    act(() => result.current.handleShowMoreConversations('/a'));
    expect(result.current.loadedCounts['/a']).toBe(25);

    act(() => result.current.handleExpandAllProjects());

    expect(result.current.expandedWorkspaces).toEqual(['/a', '/b']);
    expect(result.current.loadedCounts).toEqual({});
    expect(getProjectLoadedCount(result.current.loadedCounts, '/a')).toBe(5);
    expect(getProjectLoadedCount(result.current.loadedCounts, '/b')).toBe(5);
    expect(result.current.collapsedSections.has('projects')).toBe(false);
    expect(result.current.collapsedSections.has('pinned-projects')).toBe(false);
  });

  it('collapse-all closes every project and clears every loaded count', () => {
    setHistory([workspaceItem('/a', 20), workspaceItem('/b', 3)]);

    const { result } = renderHook(() => useConversations());

    act(() => result.current.handleExpandAllProjects());
    act(() => result.current.handleShowMoreConversations('/a'));
    expect(result.current.expandedWorkspaces).toEqual(['/a', '/b']);
    expect(result.current.loadedCounts['/a']).toBe(15);

    act(() => result.current.handleCollapseAllProjects());

    expect(result.current.expandedWorkspaces).toEqual([]);
    expect(result.current.loadedCounts).toEqual({});
  });
});

describe('ordinary-project list paging', () => {
  it('starts at five projects and adds ten per click', () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.projectListLoadedCount).toBe(5);
    act(() => result.current.handleShowMoreProjects());
    expect(result.current.projectListLoadedCount).toBe(15);
    act(() => result.current.handleShowMoreProjects());
    expect(result.current.projectListLoadedCount).toBe(25);
  });

  it('resets only the normal project window when its section is folded or unfolded', () => {
    setHistory([workspaceItem('/a', 22)]);
    const { result } = renderHook(() => useConversations());
    act(() => {
      result.current.handleShowMoreProjects();
      result.current.handleShowMoreConversations('/a');
      result.current.toggleSection('projects');
    });
    expect(result.current.projectListLoadedCount).toBe(5);
    expect(result.current.loadedCounts).toEqual({ '/a': 15 });
    act(() => {
      result.current.handleShowMoreProjects();
      result.current.toggleSection('projects');
    });
    expect(result.current.projectListLoadedCount).toBe(5);
  });

  it('keeps the project window while expanding/collapsing all or folding pinned projects', () => {
    setHistory([workspaceItem('/a', 22)]);
    const { result } = renderHook(() => useConversations());
    act(() => result.current.handleShowMoreProjects());
    act(() => result.current.handleExpandAllProjects());
    expect(result.current.projectListLoadedCount).toBe(15);
    act(() => result.current.handleCollapseAllProjects());
    expect(result.current.projectListLoadedCount).toBe(15);
    act(() => result.current.toggleSection('pinned-projects'));
    expect(result.current.projectListLoadedCount).toBe(15);
  });

  it('reveals an off-page conversation and its normal-project rank without counting pinned projects', () => {
    const pinnedProjects = ['/pin'];
    const items = [
      workspaceItem('/pin', 1),
      ...Array.from({ length: 17 }, (_, i) => workspaceItem(`/project-${i}`, 22)),
    ];
    setHistory(items);
    mocks.paramsId = conversationId('/project-15', 16);
    const { result } = renderHook(() => useConversations({ pinnedProjects }));
    expect(result.current.projectListLoadedCount).toBe(25);
    expect(result.current.loadedCounts).toEqual({ '/project-15': 25 });
    expect(result.current.expandedWorkspaces).toEqual(['/project-15']);
  });

  it('does not grow the normal window when a pinned project is revealed', () => {
    const pinnedProjects = ['/pin'];
    setHistory([...Array.from({ length: 17 }, (_, i) => workspaceItem(`/project-${i}`, 1)), workspaceItem('/pin', 22)]);
    mocks.paramsId = conversationId('/pin', 16);
    const { result } = renderHook(() => useConversations({ pinnedProjects }));
    expect(result.current.projectListLoadedCount).toBe(5);
    expect(result.current.loadedCounts).toEqual({ '/pin': 25 });
  });

  it('does not inflate either window for a route id absent from the current data', () => {
    setHistory([workspaceItem('/a', 22)]);
    mocks.paramsId = 'missing';
    const { result } = renderHook(() => useConversations());
    expect(result.current.projectListLoadedCount).toBe(5);
    expect(result.current.loadedCounts).toEqual({});
    expect(result.current.expandedWorkspaces).toEqual([]);
  });

  it('publishes folds, pin membership and project windows together to Ctrl+Tab', () => {
    const pinnedProjects = ['/pin'];
    setHistory([workspaceItem('/pin', 1), ...Array.from({ length: 6 }, (_, i) => workspaceItem(`/p-${i}`, 1))]);
    const owner = renderHook(() => useConversations({ pinnedProjects }));
    const subscriber = renderHook(() => useVisibleConversationIds());
    act(() => owner.result.current.handleExpandAllProjects());
    expect(subscriber.result.current).toEqual(['/pin/c-1', '/p-0/c-1', '/p-1/c-1', '/p-2/c-1', '/p-3/c-1', '/p-4/c-1']);
    act(() => owner.result.current.handleShowMoreProjects());
    expect(subscriber.result.current).toEqual([
      '/pin/c-1',
      '/p-0/c-1',
      '/p-1/c-1',
      '/p-2/c-1',
      '/p-3/c-1',
      '/p-4/c-1',
      '/p-5/c-1',
    ]);
    act(() => owner.result.current.toggleSection('projects'));
    expect(subscriber.result.current).toEqual(['/pin/c-1']);
  });
});

describe('cold-start pinned-project reveal', () => {
  it('waits for pin hydration before opening the owning section without growing the normal window', () => {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(['projects', 'pinned-projects']));
    setHistory([...Array.from({ length: 16 }, (_, i) => workspaceItem(`/normal-${i}`, 1)), workspaceItem('/pin', 22)]);
    mocks.paramsId = conversationId('/pin', 16);
    const { result, rerender } = renderHook(
      ({ pinnedProjects, pinnedProjectsReady }) => useConversations({ pinnedProjects, pinnedProjectsReady }),
      { initialProps: { pinnedProjects: [] as string[], pinnedProjectsReady: false } }
    );
    expect(result.current.expandedWorkspaces).toEqual([]);
    rerender({ pinnedProjects: ['/pin'], pinnedProjectsReady: true });
    expect(result.current.projectListLoadedCount).toBe(5);
    expect({ expanded: result.current.expandedWorkspaces, folds: [...result.current.collapsedSections] }).toEqual({
      expanded: ['/pin'],
      folds: ['projects'],
    });
  });
});
