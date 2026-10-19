/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { GroupedHistoryResult, TimelineSection } from '@/renderer/pages/conversation/GroupedHistory/types';
import {
  buildVisibleConversationIds,
  getProjectLoadedCount,
  loadedCountCovering,
  INITIAL_PAGE_SIZE,
  PAGE_STEP,
  isSectionOpen,
  sliceVisibleProjects,
  getVisibleProjectConversations,
  sliceLoadedConversations,
} from '@/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder';
import type { TChatConversation } from '@/common/config/storage';

/** Conversation ids in activity order: a-1 is the most recent. */
const conversations = (prefix: string, count: number): TChatConversation[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }) as TChatConversation);

const workspaceSection = (workspace: string, count: number): TimelineSection => ({
  timeline: 'today',
  items: [
    {
      type: 'workspace',
      time: 0,
      workspaceGroup: { workspace, display_name: workspace, conversations: conversations(workspace, count) },
    },
  ],
});

const grouped = (sections: TimelineSection[]): GroupedHistoryResult => ({
  pinnedConversations: [],
  timelineSections: sections,
});

const defaultView = { collapsedSections: [], pinnedProjects: [], projectListLoadedCount: 5 };

describe('paging sizes', () => {
  it('starts at five and advances by ten', () => {
    expect(INITIAL_PAGE_SIZE).toBe(5);
    expect(PAGE_STEP).toBe(10);
  });
});

describe('getProjectLoadedCount', () => {
  it('defaults an untracked workspace to the page size', () => {
    expect(getProjectLoadedCount({}, '/a')).toBe(5);
  });

  it('returns the tracked count of a known workspace', () => {
    expect(getProjectLoadedCount({ '/a': 15 }, '/a')).toBe(15);
  });

  it('keeps workspaces independent', () => {
    expect(getProjectLoadedCount({ '/a': 15 }, '/b')).toBe(5);
  });
});

describe('sliceLoadedConversations', () => {
  it('defaults to the first 5 by activity order', () => {
    const slice = sliceLoadedConversations(conversations('/a', 12), getProjectLoadedCount({}, '/a'));
    expect(slice.map((c) => c.id)).toEqual(['/a-1', '/a-2', '/a-3', '/a-4', '/a-5']);
  });

  it('walks a 22-conversation project 5 -> 15 -> 22', () => {
    const all = conversations('/a', 22);
    expect(sliceLoadedConversations(all, 5)).toHaveLength(5);
    expect(sliceLoadedConversations(all, 15)).toHaveLength(15);
    expect(sliceLoadedConversations(all, 25)).toHaveLength(22);
  });

  it('stops at twelve when one increment exhausts the list', () => {
    expect(sliceLoadedConversations(conversations('/a', 12), 15)).toHaveLength(12);
  });

  it('never returns a negative-length slice', () => {
    expect(sliceLoadedConversations(conversations('/a', 3), -4)).toEqual([]);
  });

  it('returns everything for an unbounded count', () => {
    expect(sliceLoadedConversations(conversations('/a', 12), Infinity)).toHaveLength(12);
  });
});

describe('loadedCountCovering', () => {
  it('covers the 5th conversation (index 4) with 5', () => {
    expect(loadedCountCovering(4)).toBe(5);
  });

  it.each([
    [5, 15],
    [14, 15],
    [15, 25],
    [24, 25],
    [25, 35],
  ])('covers index %i with %i', (index, expected) => {
    expect(loadedCountCovering(index)).toBe(expected);
  });

  it('covers the 13th conversation (index 12) with 15', () => {
    expect(loadedCountCovering(12)).toBe(15);
  });

  it('covers the first conversation with one page', () => {
    expect(loadedCountCovering(0)).toBe(5);
  });
});

describe('buildVisibleConversationIds', () => {
  it('only lists the loaded slice of an expanded workspace', () => {
    const ids = buildVisibleConversationIds({
      ...defaultView,
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: ['/a'],
      loadedCounts: {},
      siderCollapsed: false,
    });
    expect(ids).toEqual(['/a-1', '/a-2', '/a-3', '/a-4', '/a-5']);

    const widened = buildVisibleConversationIds({
      ...defaultView,
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: ['/a'],
      loadedCounts: { '/a': 10 },
      siderCollapsed: false,
    });
    expect(widened).toHaveLength(10);
  });

  it('lists nothing for a collapsed workspace', () => {
    const ids = buildVisibleConversationIds({
      ...defaultView,
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: [],
      loadedCounts: { '/a': 10 },
      siderCollapsed: false,
    });
    expect(ids).toEqual([]);
  });

  it('lists every workspace conversation when the sider is collapsed', () => {
    const ids = buildVisibleConversationIds({
      ...defaultView,
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: [],
      loadedCounts: {},
      siderCollapsed: true,
    });
    expect(ids).toHaveLength(12);
  });

  it('pages each expanded workspace with its own count', () => {
    const ids = buildVisibleConversationIds({
      ...defaultView,
      ...grouped([workspaceSection('/a', 12), workspaceSection('/b', 12)]),
      expandedWorkspaces: ['/a', '/b'],
      loadedCounts: { '/a': 10 },
      siderCollapsed: false,
    });
    expect(ids.filter((id) => id.startsWith('/a-'))).toHaveLength(10);
    expect(ids.filter((id) => id.startsWith('/b-'))).toHaveLength(5);
  });

  it('keeps pinned and flat conversations ahead of the workspace slices', () => {
    const ids = buildVisibleConversationIds({
      ...defaultView,
      pinnedConversations: conversations('/pin', 1),
      timelineSections: [
        {
          timeline: 'today',
          items: [
            { type: 'conversation', time: 0, conversation: { id: 'flat-1' } as TChatConversation },
            ...workspaceSection('/a', 12).items,
          ],
        },
      ],
      expandedWorkspaces: ['/a'],
      loadedCounts: {},
      siderCollapsed: false,
    });
    expect(ids.slice(0, 2)).toEqual(['/pin-1', 'flat-1']);
    expect(ids).toHaveLength(7);
  });
});

describe('shared visibility predicates', () => {
  it('keeps folded sections closed and ignores paging only in the narrow sider', () => {
    expect(isSectionOpen(new Set(['projects']), 'projects')).toBe(false);
    expect(sliceVisibleProjects([1, 2, 3], -1, false)).toEqual([]);
    expect(sliceVisibleProjects([1, 2, 3], 1, true)).toEqual([1, 2, 3]);
  });

  it('returns no rows from a folded project but all its rows in the narrow sider', () => {
    const group = { workspace: '/a', conversations: conversations('/a', 22) };
    expect(getVisibleProjectConversations(group, [], {}, false)).toEqual([]);
    expect(getVisibleProjectConversations(group, ['/a'], {}, false)).toHaveLength(5);
    expect(getVisibleProjectConversations(group, [], {}, true)).toHaveLength(22);
  });
});

describe('canonical visibility across sections and project windows', () => {
  const history: GroupedHistoryResult = {
    pinnedConversations: conversations('pin', 1),
    timelineSections: [
      {
        timeline: 'today',
        items: [
          { type: 'conversation', time: 0, conversation: { id: 'free-1' } as TChatConversation },
          ...workspaceSection('a', 1).items,
          ...workspaceSection('pinned-project', 2).items,
          ...workspaceSection('b', 1).items,
          ...workspaceSection('c', 1).items,
          ...workspaceSection('d', 1).items,
          ...workspaceSection('e', 1).items,
          ...workspaceSection('f', 1).items,
          { type: 'conversation', time: 0, conversation: { id: 'free-2' } as TChatConversation },
        ],
      },
    ],
  };
  const view = {
    expandedWorkspaces: ['a', 'pinned-project', 'b', 'c', 'd', 'e', 'f'],
    loadedCounts: {},
    collapsedSections: [],
    pinnedProjects: ['pinned-project'],
    projectListLoadedCount: 5,
    siderCollapsed: false,
  };

  it('preserves independent canonical order while pinned projects consume no normal slots', () => {
    expect(buildVisibleConversationIds({ ...history, ...view })).toEqual([
      'pin-1',
      'free-1',
      'a-1',
      'pinned-project-1',
      'pinned-project-2',
      'b-1',
      'c-1',
      'd-1',
      'e-1',
      'free-2',
    ]);
  });

  it.each([false, true])('respects every section fold with narrow=%s', (siderCollapsed) => {
    expect(
      buildVisibleConversationIds({
        ...history,
        ...view,
        siderCollapsed,
        collapsedSections: ['projects', 'pinned', 'conversations'],
      })
    ).toEqual(['pinned-project-1', 'pinned-project-2']);
    expect(
      buildVisibleConversationIds({
        ...history,
        ...view,
        siderCollapsed,
        collapsedSections: ['projects', 'pinned-projects', 'pinned', 'conversations'],
      })
    ).toEqual([]);
  });

  it('bypasses project and conversation windows but not section folds in the narrow sider', () => {
    expect(
      buildVisibleConversationIds({
        ...history,
        ...view,
        siderCollapsed: true,
        expandedWorkspaces: [],
        collapsedSections: ['pinned-projects'],
      })
    ).toEqual(['pin-1', 'free-1', 'a-1', 'b-1', 'c-1', 'd-1', 'e-1', 'f-1', 'free-2']);
  });

  it('returns no duplicate ids even if a conversation appears twice in the supplied history', () => {
    expect(
      buildVisibleConversationIds({ ...history, ...view, pinnedConversations: [{ id: 'free-1' } as TChatConversation] })
    ).toEqual(['free-1', 'a-1', 'pinned-project-1', 'pinned-project-2', 'b-1', 'c-1', 'd-1', 'e-1', 'free-2']);
  });
});
