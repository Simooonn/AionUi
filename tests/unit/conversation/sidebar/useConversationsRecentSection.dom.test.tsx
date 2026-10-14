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
  // Mutable so each case decides which conversation route is active.
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
  }),
}));

import { useConversations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversations';
import { dispatchWorkspaceExpansionChange } from '@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState';

const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';
const WORKSPACE = '/ws';
const TARGET = `${WORKSPACE}/c-1`;

const workspaceItem = (workspace: string, count: number): TimelineItem => ({
  type: 'workspace',
  time: 0,
  workspaceGroup: {
    workspace,
    display_name: workspace,
    conversations: Array.from(
      { length: count },
      (_, index) => ({ id: `${workspace}/c-${index + 1}` }) as TChatConversation
    ),
  },
});

/** A `getBoundingClientRect` result; jsdom reports all zeros unless a case overrides it. */
const rect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, height: bottom - top, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

/** A scrollable sidebar viewport spanning 0..500px. */
const appendViewport = (): HTMLElement => {
  const viewport = document.createElement('div');
  viewport.style.overflowY = 'auto';
  viewport.getBoundingClientRect = () => rect(0, 500);
  document.body.appendChild(viewport);
  return viewport;
};

/** A rendered sidebar row; without `box` it has jsdom's zero rect and so never counts as visible. */
const appendRow = (parent: HTMLElement, id: string, box?: DOMRect): HTMLElement => {
  const row = document.createElement('div');
  row.id = id;
  if (box) row.getBoundingClientRect = () => box;
  parent.appendChild(row);
  return row;
};

/** Ids of the elements `scrollIntoView` was called on, in call order. */
let scrolledIds: string[] = [];
let scrollSpy: ReturnType<typeof vi.spyOn> | null = null;

/** Lets both animation frames of a pending scroll fire (the dom setup shims RAF with timers). */
const flushFrames = () => act(() => new Promise((resolve) => setTimeout(resolve, 50)));

beforeEach(() => {
  mocks.paramsId = undefined;
  mocks.groupedHistory = {
    pinnedConversations: [],
    timelineSections: [{ timeline: 'today', items: [workspaceItem(WORKSPACE, 3)] }],
  };
  localStorage.clear();
  // `lastSnapshot` is module-level mutable state shared by every case.
  dispatchWorkspaceExpansionChange({ expandedWorkspaces: [], loadedCounts: {} });
  scrolledIds = [];
  scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
    scrolledIds.push(this.id);
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

describe('useConversations recent-section paging', () => {
  it('starts at one page and grows one page per show-more call', () => {
    const { result } = renderHook(() => useConversations());
    expect(result.current.recentLoadedCount).toBe(5);

    act(() => result.current.handleShowMoreRecent());
    expect(result.current.recentLoadedCount).toBe(10);

    act(() => result.current.handleShowMoreRecent());
    expect(result.current.recentLoadedCount).toBe(15);
  });

  it('restarts at one page whenever the recent section is folded or unfolded, and persists the fold', () => {
    const { result } = renderHook(() => useConversations());
    act(() => result.current.handleShowMoreRecent());
    expect(result.current.recentLoadedCount).toBe(10);

    act(() => result.current.toggleSection('recent'));
    expect(result.current.collapsedSections.has('recent')).toBe(true);
    expect(result.current.recentLoadedCount).toBe(5);
    expect(JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY) ?? '[]')).toContain('recent');

    act(() => result.current.handleShowMoreRecent());
    act(() => result.current.toggleSection('recent'));
    expect(result.current.collapsedSections.has('recent')).toBe(false);
    expect(result.current.recentLoadedCount).toBe(5);
  });

  it('leaves the recent paging alone when another section is toggled', () => {
    const { result } = renderHook(() => useConversations());
    act(() => result.current.handleShowMoreRecent());

    act(() => result.current.toggleSection('projects'));
    expect(result.current.recentLoadedCount).toBe(10);
  });
});

describe('useConversations reveal of a conversation the recent section renders', () => {
  it('only scrolls the recent row when it is the sole rendered row and out of view', async () => {
    localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify(['projects']));
    appendRow(document.body, `rc-${TARGET}`);
    mocks.paramsId = TARGET;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(scrolledIds).toEqual([`rc-${TARGET}`]));
    expect(result.current.expandedWorkspaces).toEqual([]);
    expect(result.current.loadedCounts).toEqual({});
    expect(result.current.collapsedSections.has('projects')).toBe(true);
    expect(mocks.setActiveConversation).toHaveBeenCalledWith(TARGET);
    expect(mocks.clearCompletionUnread).toHaveBeenCalledWith(TARGET);
  });

  it('moves nothing when the recent row is already fully in view', async () => {
    appendRow(appendViewport(), `rc-${TARGET}`, rect(10, 44));
    mocks.paramsId = TARGET;

    const { result } = renderHook(() => useConversations());
    await flushFrames();

    expect(scrolledIds).toEqual([]);
    expect(result.current.expandedWorkspaces).toEqual([]);
    expect(result.current.loadedCounts).toEqual({});
  });

  it('moves nothing when the conversation is in view in its own section', async () => {
    const viewport = appendViewport();
    appendRow(viewport, `rc-${TARGET}`, rect(-60, -26));
    appendRow(viewport, `c-${TARGET}`, rect(200, 234));
    mocks.paramsId = TARGET;

    const { result } = renderHook(() => useConversations());
    await flushFrames();

    expect(scrolledIds).toEqual([]);
    expect(result.current.expandedWorkspaces).toEqual([]);
  });

  it('keeps the legacy reveal when its own row is rendered but out of view (Ctrl+Tab follow)', async () => {
    const viewport = appendViewport();
    appendRow(viewport, `rc-${TARGET}`, rect(-60, -26));
    appendRow(viewport, `c-${TARGET}`, rect(600, 634));
    mocks.paramsId = TARGET;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(scrolledIds).toEqual([`c-${TARGET}`]));
    expect(result.current.expandedWorkspaces).toEqual([WORKSPACE]);
  });

  it('treats a row only partly inside the viewport as out of view', async () => {
    const viewport = appendViewport();
    appendRow(viewport, `rc-${TARGET}`, rect(480, 514));
    mocks.paramsId = TARGET;

    renderHook(() => useConversations());

    await waitFor(() => expect(scrolledIds).toEqual([`rc-${TARGET}`]));
  });

  it('expands the project as before when the recent section does not render the conversation', async () => {
    appendRow(document.body, `c-${TARGET}`);
    mocks.paramsId = TARGET;

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(scrolledIds).toEqual([`c-${TARGET}`]));
    expect(result.current.expandedWorkspaces).toEqual([WORKSPACE]);
  });
});
