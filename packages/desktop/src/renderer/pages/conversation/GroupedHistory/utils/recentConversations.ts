/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';

import type { GroupedHistoryResult } from '../types';

/** Collapsed-sections key of the sidebar's recent-conversations section. */
export const RECENT_SECTION_KEY = 'recent';

/**
 * DOM id prefix of rows rendered in the recent section. The same conversation
 * also renders in its own section, so the recent copy keeps `#c-<id>` unique.
 */
export const RECENT_ROW_ID_PREFIX = 'rc-';

export type RecentConversation = {
  conversation: TChatConversation;
  /** Display name of the conversation's project; undefined for a conversation without one. */
  projectLabel?: string;
};

/**
 * Project workspace of a conversation, or undefined when it has none. Same rule
 * as `groupConversationsByWorkspace`: only a user-chosen workspace makes a project.
 */
export const getProjectWorkspace = (conversation: TChatConversation): string | undefined => {
  const workspace = conversation.extra?.workspace;
  return conversation.extra?.custom_workspace && workspace ? workspace : undefined;
};

/**
 * Every sidebar conversation — pinned, inside a project, or free — newest
 * activity first, minus those whose project workspace no longer exists on disk.
 * Ties keep the collection order: pinned first, then the grouped sections.
 */
export const buildRecentConversations = (
  { pinnedConversations, timelineSections }: GroupedHistoryResult,
  staleWorkspaces: ReadonlySet<string>,
  t: (key: string) => string
): RecentConversation[] => {
  const displayNames = new Map<string, string>();
  const grouped: RecentConversation[] = [];
  for (const section of timelineSections) {
    for (const item of section.items) {
      if (item.type === 'workspace' && item.workspaceGroup) {
        const { workspace, display_name, conversations } = item.workspaceGroup;
        displayNames.set(workspace, display_name);
        if (staleWorkspaces.has(workspace)) continue;
        conversations.forEach((conversation) => grouped.push({ conversation, projectLabel: display_name }));
      } else if (item.type === 'conversation' && item.conversation) {
        grouped.push({ conversation: item.conversation });
      }
    }
  }

  const pinned: RecentConversation[] = [];
  for (const conversation of pinnedConversations) {
    const workspace = getProjectWorkspace(conversation);
    if (!workspace) {
      pinned.push({ conversation });
    } else if (!staleWorkspaces.has(workspace)) {
      pinned.push({
        conversation,
        projectLabel: displayNames.get(workspace) ?? getWorkspaceDisplayName(workspace, false, t),
      });
    }
  }

  return [...pinned, ...grouped].toSorted((a, b) => getActivityTime(b.conversation) - getActivityTime(a.conversation));
};
