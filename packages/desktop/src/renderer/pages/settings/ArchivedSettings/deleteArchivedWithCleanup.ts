/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ace: permanent deletion from the archived page must carry the same local
// cleanup the sidebar delete used to do before upstream moved hard-delete here.

import { ipcBridge } from '@/common';
import { deleteConversationsWithLocalData } from '@/renderer/ace/deleteWithLocalFiles';
import { emitter } from '@/renderer/utils/emitter';

/**
 * Release renderer/main-process state bound to a conversation that the backend
 * has just hard-deleted. The sidebar delete endpoints are plain backend HTTP
 * calls that never reach the Electron main process, so nothing else kills the
 * embedded terminals (PTYs) or clears the persisted command queue for it.
 */
function releaseDeletedConversation(conversation_id: string): void {
  emitter.emit('conversation.deleted', conversation_id);
  void ipcBridge.terminal.disposeByConversation
    .invoke({ conversationId: conversation_id })
    .catch((): void => undefined);
}

/**
 * Permanently delete one archived unit (a conversation, a team, or a whole
 * project) through `deleteOnBackend`, and clean up the local CLI session data
 * of every conversation that deletion removes.
 *
 * Order matters and mirrors the original sidebar flow: local session files are
 * resolved while the rows still exist, then the backend call runs, then only
 * the data of the removed conversations is unlinked. A backend failure
 * rethrows before any local cleanup.
 *
 * @param conversationIds every conversation the backend call will remove: the
 *   conversation itself, a team's members, or the loaded rows of a project.
 * @param deleteOnBackend the single sidebar delete endpoint call.
 * @returns whether any local file could not be removed (best-effort; the DB
 *   delete already succeeded at that point).
 */
export async function deleteArchivedWithCleanup(
  conversationIds: string[],
  deleteOnBackend: () => Promise<void>
): Promise<{ fileDeleteFailed: boolean }> {
  const { fileDeleteFailed } = await deleteConversationsWithLocalData(conversationIds, async (ids) => {
    await deleteOnBackend();
    return ids.map(() => true);
  });
  for (const conversation_id of conversationIds) {
    releaseDeletedConversation(conversation_id);
  }
  return { fileDeleteFailed };
}
