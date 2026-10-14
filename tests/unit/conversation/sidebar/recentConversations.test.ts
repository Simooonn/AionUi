/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import type { GroupedHistoryResult, TimelineItem } from '@/renderer/pages/conversation/GroupedHistory/types';
import {
  buildRecentConversations,
  getProjectWorkspace,
} from '@/renderer/pages/conversation/GroupedHistory/utils/recentConversations';

const t = (key: string): string => key;
const NO_STALE: ReadonlySet<string> = new Set();

/** A conversation with an explicit activity time; `extra` is optional on purpose (group fixtures carry none). */
const conversation = (
  id: string,
  times: { modified_at?: number; created_at?: number },
  extra?: TChatConversation['extra']
): TChatConversation => ({ id, name: id, type: 'acp', ...times, extra }) as unknown as TChatConversation;

const workspaceItem = (workspace: string, display_name: string, conversations: TChatConversation[]): TimelineItem => ({
  type: 'workspace',
  time: 0,
  workspaceGroup: { workspace, display_name, conversations },
});

const freeItem = (item: TChatConversation): TimelineItem => ({ type: 'conversation', time: 0, conversation: item });

const history = (pinnedConversations: TChatConversation[], items: TimelineItem[]): GroupedHistoryResult => ({
  pinnedConversations,
  timelineSections: items.length > 0 ? [{ timeline: 'recents', items }] : [],
});

const ids = (result: ReturnType<typeof buildRecentConversations>) => result.map((entry) => entry.conversation.id);

describe('getProjectWorkspace', () => {
  it('returns the workspace only for a user-chosen one', () => {
    expect(getProjectWorkspace(conversation('a', {}, { workspace: '/repo', custom_workspace: true }))).toBe('/repo');
    expect(getProjectWorkspace(conversation('b', {}, { workspace: '/tmp/session' }))).toBeUndefined();
    expect(getProjectWorkspace(conversation('c', {}))).toBeUndefined();
  });
});

describe('buildRecentConversations', () => {
  it('merges pinned, project and free conversations, newest activity first', () => {
    const result = buildRecentConversations(
      history(
        [conversation('pinned', { modified_at: 300 })],
        [
          workspaceItem('/a', 'project-a', [
            conversation('a-1', { modified_at: 500 }),
            conversation('a-2', { modified_at: 100 }),
          ]),
          freeItem(conversation('free', { modified_at: 400 })),
        ]
      ),
      NO_STALE,
      t
    );

    expect(ids(result)).toEqual(['a-1', 'free', 'pinned', 'a-2']);
  });

  it('falls back to created_at when modified_at is missing', () => {
    const result = buildRecentConversations(
      history(
        [],
        [freeItem(conversation('old', { modified_at: 200 })), freeItem(conversation('created', { created_at: 300 }))]
      ),
      NO_STALE,
      t
    );

    expect(ids(result)).toEqual(['created', 'old']);
  });

  it('keeps the collection order on equal activity: pinned first, then section order', () => {
    const result = buildRecentConversations(
      history(
        [conversation('pinned', { modified_at: 100 })],
        [
          workspaceItem('/a', 'project-a', [conversation('a-1', { modified_at: 100 })]),
          freeItem(conversation('free', { modified_at: 100 })),
        ]
      ),
      NO_STALE,
      t
    );

    expect(ids(result)).toEqual(['pinned', 'a-1', 'free']);
  });

  it('drops every conversation of a stale project, judged by the group workspace', () => {
    const result = buildRecentConversations(
      history(
        [],
        [
          workspaceItem('/gone', 'gone', [conversation('gone-1', { modified_at: 900 })]),
          workspaceItem('/a', 'project-a', [conversation('a-1', { modified_at: 100 })]),
        ]
      ),
      new Set(['/gone']),
      t
    );

    expect(ids(result)).toEqual(['a-1']);
  });

  it('drops a pinned conversation whose project workspace is stale', () => {
    const result = buildRecentConversations(
      history(
        [
          conversation('pinned-gone', { modified_at: 300 }, { workspace: '/gone', custom_workspace: true }),
          conversation('pinned-free', { modified_at: 200 }, { workspace: '/gone' }),
        ],
        []
      ),
      new Set(['/gone']),
      t
    );

    // Without custom_workspace the conversation is not in a project, so staleness does not apply.
    expect(ids(result)).toEqual(['pinned-free']);
  });

  it('labels each entry with its project name', () => {
    const result = buildRecentConversations(
      history(
        [
          conversation('pinned-in-a', { modified_at: 400 }, { workspace: '/a', custom_workspace: true }),
          conversation('pinned-elsewhere', { modified_at: 300 }, { workspace: '/repos/other', custom_workspace: true }),
          conversation('pinned-free', { modified_at: 200 }),
        ],
        [
          workspaceItem('/a', 'project-a', [conversation('a-1', { modified_at: 100 })]),
          freeItem(conversation('free', { modified_at: 50 })),
        ]
      ),
      NO_STALE,
      t
    );

    expect(result.map((entry) => [entry.conversation.id, entry.projectLabel])).toEqual([
      ['pinned-in-a', 'project-a'],
      // No group for this workspace: fall back to its last path segment.
      ['pinned-elsewhere', 'other'],
      ['pinned-free', undefined],
      ['a-1', 'project-a'],
      ['free', undefined],
    ]);
  });

  it('returns an empty list for an empty history', () => {
    expect(buildRecentConversations(history([], []), NO_STALE, t)).toEqual([]);
  });
});
