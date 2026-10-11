/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Status badge kinds a project folder can surface, listed in display order. */
export const FOLDER_STATUS_ORDER = ['waiting', 'generating', 'unread'] as const;

export type FolderStatusKind = (typeof FOLDER_STATUS_ORDER)[number];

export type ConversationStatusLookup = {
  isGenerating: (conversationId: string) => boolean;
  isWaitingConfirmation: (conversationId: string) => boolean;
  hasUnread: (conversationId: string) => boolean;
};

/**
 * The single badge a conversation row actually renders. Mirrors ConversationRow's
 * precedence (waiting > generating > unread) so a folder never surfaces a status
 * that is hidden on every row inside it.
 */
export const resolveRowStatus = (conversationId: string, lookup: ConversationStatusLookup): FolderStatusKind | null => {
  if (lookup.isWaitingConfirmation(conversationId)) return 'waiting';
  if (lookup.isGenerating(conversationId)) return 'generating';
  if (lookup.hasUnread(conversationId)) return 'unread';
  return null;
};

/**
 * De-duplicated union of the badges visible on a folder's rows, kept in
 * FOLDER_STATUS_ORDER. Reads the grouped conversations rather than the rendered
 * rows, so a collapsed folder reports the same statuses an expanded one does.
 */
export const collectFolderStatuses = (
  conversations: ReadonlyArray<{ id: string }>,
  lookup: ConversationStatusLookup
): FolderStatusKind[] => {
  const found = new Set<FolderStatusKind>();
  for (const conversation of conversations) {
    const status = resolveRowStatus(conversation.id, lookup);
    if (status) found.add(status);
    if (found.size === FOLDER_STATUS_ORDER.length) break;
  }
  return FOLDER_STATUS_ORDER.filter((kind) => found.has(kind));
};
