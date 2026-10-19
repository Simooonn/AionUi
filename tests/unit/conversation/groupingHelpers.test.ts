/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const t = (key: string): string => key;

const conversation = (id: string, extra: TChatConversation['extra'], modified_at: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as TChatConversation;

describe('buildGroupedHistory', () => {
  it('keeps scheduled-task conversations in the regular conversation timeline', () => {
    const result = buildGroupedHistory(
      [conversation('cron-conversation', { backend: 'aioncore', cron_job_id: 'job-1' }, 100)],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'conversation',
        conversation: expect.objectContaining({ id: 'cron-conversation' }),
      }),
    ]);
  });

  it('keeps scheduled-task conversations with workspaces in the project section', () => {
    const result = buildGroupedHistory(
      [
        conversation(
          'cron-project-conversation',
          {
            backend: 'aioncore',
            cron_job_id: 'job-1',
            workspace: '/repo/aionui',
            custom_workspace: true,
          },
          100
        ),
      ],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({
          workspace: '/repo/aionui',
          conversations: [expect.objectContaining({ id: 'cron-project-conversation' })],
        }),
      }),
    ]);
  });

  it('orders projects and members by chat time rather than metadata changes', () => {
    const old = { ...conversation('old', { workspace: '/a', custom_workspace: true }, 9000), chat_activity_at: 100 };
    const newer = { ...conversation('new', { workspace: '/a', custom_workspace: true }, 100), chat_activity_at: 200 };
    const latest = {
      ...conversation('latest', { workspace: '/b', custom_workspace: true }, 50),
      chat_activity_at: 300,
    };
    const items = buildGroupedHistory([old, newer, latest], t).timelineSections[0].items;
    expect(items.map((item) => item.workspaceGroup?.workspace)).toEqual(['/b', '/a']);
    expect(items[1].workspaceGroup?.conversations.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('keeps project activity when its newest member is individually pinned', () => {
    const recent = {
      ...conversation('recent', { workspace: '/a', custom_workspace: true, pinned: true }, 9000),
      chat_activity_at: 300,
    };
    const older = { ...conversation('older', { workspace: '/a', custom_workspace: true }, 100), chat_activity_at: 100 };
    const other = { ...conversation('other', { workspace: '/b', custom_workspace: true }, 500), chat_activity_at: 200 };
    const result = buildGroupedHistory([recent, older, other], t);
    expect(result.timelineSections[0].items.map((item) => [item.workspaceGroup?.workspace, item.time])).toEqual([
      ['/a', 300],
      ['/b', 200],
    ]);
    expect(result.timelineSections[0].items[0].workspaceGroup?.conversations.map((item) => item.id)).toEqual(['older']);
    expect(result.pinnedConversations.map((item) => item.id)).toEqual(['recent']);
  });

  it('retains a project with no ordinary members when its only member is pinned', () => {
    const pinned = {
      ...conversation('pinned', { workspace: '/a', custom_workspace: true, pinned: true }, 9000),
      chat_activity_at: 300,
    };
    const items = buildGroupedHistory([pinned], t).timelineSections[0].items;
    expect(items).toMatchObject([{ time: 300, workspaceGroup: { workspace: '/a', conversations: [] } }]);
  });

  it('uses stable creation and ID ties without changing manual pin order', () => {
    const a = { ...conversation('a', { pinned: true, sortOrder: 20 }, 100), chat_activity_at: 500 };
    const b = { ...conversation('b', { pinned: true, sortOrder: 10 }, 200), chat_activity_at: 200 };
    const result = buildGroupedHistory([a, b], t);
    expect(result.pinnedConversations.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('continues to hide team-owned conversations from the regular history', () => {
    const result = buildGroupedHistory(
      [conversation('team-conversation', { backend: 'aioncore', team_id: 'team-1' }, 100)],
      t
    );

    expect(result.timelineSections).toEqual([]);
  });
});
