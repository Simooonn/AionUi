/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { compareByChatActivity, getChatActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';

import type { GroupedHistoryResult, TimelineItem, TimelineSection } from '../types';
import { getConversationSortOrder } from './sortOrderHelpers';
import { getProjectWorkspace } from './recentConversations';

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinned_at?: number } | undefined;
  if (typeof extra?.pinned_at === 'number') {
    return extra.pinned_at;
  }
  return 0;
};

export const groupConversationsByWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string,
  pinnedActivityByWorkspace: ReadonlyMap<string, number> = new Map()
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const custom_workspace = conv.extra?.custom_workspace;

    if (custom_workspace && workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  // A project remains present when its last normal member is individually pinned.
  for (const workspace of pinnedActivityByWorkspace.keys()) {
    if (!allWorkspaceGroups.has(workspace)) allWorkspaceGroups.set(workspace, []);
  }
  const items: TimelineItem[] = [];

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = convList.toSorted(compareByChatActivity);
    const latestConversationTime = sortedConvs[0] ? getChatActivityTime(sortedConvs[0]) : 0;
    const time = Math.max(pinnedActivityByWorkspace.get(workspace) ?? 0, latestConversationTime);
    items.push({
      type: 'workspace',
      time,
      workspaceGroup: {
        workspace,
        // This grouping path only sees custom (user-chosen) workspaces —
        // non-custom conversations end up in `withoutWorkspaceConvs` above
        // and never reach this helper. Passing `false` is therefore correct
        // without consulting `extra.is_temporary_workspace` per-row.
        display_name: getWorkspaceDisplayName(workspace, false, t),
        conversations: sortedConvs,
      },
    });
  });

  withoutWorkspaceConvs.forEach((conv) => {
    items.push({
      type: 'conversation',
      time: getChatActivityTime(conv),
      conversation: conv,
    });
  });

  items.sort((a, b) => {
    if (a.time !== b.time) return b.time - a.time;
    if (a.conversation && b.conversation) return compareByChatActivity(a.conversation, b.conversation);
    const keyA = a.workspaceGroup?.workspace ?? a.conversation?.id ?? '';
    const keyB = b.workspaceGroup?.workspace ?? b.conversation?.id ?? '';
    return keyA.localeCompare(keyB);
  });

  if (items.length === 0) return [];

  return [
    {
      timeline: t('conversation.history.recents'),
      items,
    },
  ];
};

/** Check whether a conversation belongs to a team (should be hidden from sidebar). */
const isTeamConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { team_id?: string; teamId?: string } | undefined;
  return Boolean(extra?.team_id || extra?.teamId);
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  // Filter out team-owned conversations; they are only visible via the Teams panel
  const visibleConversations = conversations.filter((conv) => !isTeamConversation(conv));

  const pinnedConversations = visibleConversations
    .filter((conversation) => isConversationPinned(conversation))
    .toSorted((a, b) => {
      const orderA = getConversationSortOrder(a);
      const orderB = getConversationSortOrder(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return getConversationPinnedAt(b) - getConversationPinnedAt(a);
    });

  const normalConversations = visibleConversations.filter((conversation) => !isConversationPinned(conversation));

  const pinnedActivityByWorkspace = new Map<string, number>();
  for (const conversation of pinnedConversations) {
    const workspace = getProjectWorkspace(conversation);
    if (workspace) {
      pinnedActivityByWorkspace.set(
        workspace,
        Math.max(pinnedActivityByWorkspace.get(workspace) ?? 0, getChatActivityTime(conversation))
      );
    }
  }

  return {
    pinnedConversations,
    timelineSections: groupConversationsByWorkspace(normalConversations, t, pinnedActivityByWorkspace),
  };
};
