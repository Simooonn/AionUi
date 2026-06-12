/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Assemble the 24h active-session snapshot at debounce-window expiry.
 * List-level fetch failure returns [] (the window is silently dropped);
 * row-level fetch failure degrades that row only (total '?', no summary).
 */

import { ipcBridge } from '@/common';
import type { LarkNotifyRow } from '@/common/ace/types';
import {
  LARK_NOTIFY_SUMMARY_INPUT_CAP,
  isWithinActiveWindow,
  mapWithConcurrency,
  resolveNotifyStatus,
  sortNotifyRows,
} from '@/common/ace/larkNotify';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { getGeneratingConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { getBackendKeyFromConversation } from '@/renderer/pages/conversation/GroupedHistory/utils/exportHelpers';
import { getActivityTime } from '@/renderer/utils/chat/timeline';

const ROW_FETCH_CONCURRENCY = 5;
/** DESC page size used to locate the most recent user message. */
const LAST_MESSAGE_PAGE_SIZE = 20;

/**
 * Pick the most recent user message from a DESC-ordered page and extract
 * bounded plain text. Only plain-string content is accepted — multimodal /
 * structured content is skipped rather than JSON.stringify'd into the summary
 * (rows without usable text yield null and the summary falls back to the name).
 */
export const extractLastUserMessage = (items: TMessage[] | undefined): { id: string; text: string } | null => {
  if (!items?.length) return null;
  for (const message of items) {
    if (message.type !== 'text' || message.position !== 'right') continue;
    const raw = (message.content as { content?: unknown } | undefined)?.content;
    if (typeof raw !== 'string') continue;
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, LARK_NOTIFY_SUMMARY_INPUT_CAP);
    if (text) {
      return { id: message.id, text };
    }
  }
  return null;
};

const buildRow = async (
  conversation: TChatConversation,
  generatingIds: ReadonlySet<string>,
  terminalStates: ReadonlyMap<string, string>
): Promise<LarkNotifyRow> => {
  let total: number | null = null;
  let lastUserMessage: { id: string; text: string } | null = null;
  try {
    const result = await ipcBridge.database.getConversationMessages.invoke({
      conversation_id: conversation.id,
      page: 0,
      page_size: LAST_MESSAGE_PAGE_SIZE,
      order: 'DESC',
    });
    total = typeof result?.total === 'number' ? result.total : null;
    lastUserMessage = extractLastUserMessage(result?.items);
  } catch {
    // Row-level degradation: keep the row with total '?' and no summary input
  }
  return {
    conversation_id: conversation.id,
    name: conversation.name || conversation.id,
    backend: getBackendKeyFromConversation(conversation) || conversation.type,
    workspace: (conversation.extra as { workspace?: string } | undefined)?.workspace ?? '',
    activity_time: getActivityTime(conversation),
    total,
    status: resolveNotifyStatus(conversation.id, generatingIds, terminalStates.get(conversation.id)),
    last_user_message: lastUserMessage,
  };
};

export const assembleSnapshot = async (terminalStates: ReadonlyMap<string, string>): Promise<LarkNotifyRow[]> => {
  let conversations: TChatConversation[];
  try {
    // Same single-call shape the sidebar uses (limit 10000, no cursor loop)
    const result = await ipcBridge.database.getUserConversations.invoke({ limit: 10000 });
    conversations = result?.items ?? [];
  } catch {
    return [];
  }
  const now = Date.now();
  const active = conversations.filter((c) => isWithinActiveWindow(getActivityTime(c), now));
  if (!active.length) return [];

  const generatingIds = getGeneratingConversationIds();
  const rows = await mapWithConcurrency(active, ROW_FETCH_CONCURRENCY, (c) =>
    buildRow(c, generatingIds, terminalStates)
  );
  return sortNotifyRows(rows);
};
