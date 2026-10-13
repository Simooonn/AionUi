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
  PROJECT_PAGE_SIZE,
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

describe('PROJECT_PAGE_SIZE', () => {
  it('pages project conversations 5 at a time', () => {
    expect(PROJECT_PAGE_SIZE).toBe(5);
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

  it('walks a 12-conversation project 5 -> 10 -> 12', () => {
    const all = conversations('/a', 12);
    expect(sliceLoadedConversations(all, 5)).toHaveLength(5);
    expect(sliceLoadedConversations(all, 10)).toHaveLength(10);
    expect(sliceLoadedConversations(all, 15)).toHaveLength(12);
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

  it('covers the 6th conversation (index 5) with 10', () => {
    expect(loadedCountCovering(5)).toBe(10);
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
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: ['/a'],
      loadedCounts: {},
      siderCollapsed: false,
    });
    expect(ids).toEqual(['/a-1', '/a-2', '/a-3', '/a-4', '/a-5']);

    const widened = buildVisibleConversationIds({
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: ['/a'],
      loadedCounts: { '/a': 10 },
      siderCollapsed: false,
    });
    expect(widened).toHaveLength(10);
  });

  it('lists nothing for a collapsed workspace', () => {
    const ids = buildVisibleConversationIds({
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: [],
      loadedCounts: { '/a': 10 },
      siderCollapsed: false,
    });
    expect(ids).toEqual([]);
  });

  it('lists every workspace conversation when the sider is collapsed', () => {
    const ids = buildVisibleConversationIds({
      ...grouped([workspaceSection('/a', 12)]),
      expandedWorkspaces: [],
      loadedCounts: {},
      siderCollapsed: true,
    });
    expect(ids).toHaveLength(12);
  });

  it('pages each expanded workspace with its own count', () => {
    const ids = buildVisibleConversationIds({
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
