/**
 * Self-registering IPC handler for the "import CLI sessions" fork feature.
 * Registered by a side-effect import from process/bridge/index.ts.
 */

import { ipcMain } from 'electron';
import type {
  EnsureCliResumeResult,
  ImportCliSessionsResult,
  ImportConversationMessagesResult,
} from '@/common/ace/types';
import { importCliSessions } from './importCliSessions';
import { importConversationMessages } from './messageImporter';
import { ensureCliSessionResumable } from './sessionResume';

ipcMain.handle('ace:import-cli-sessions', async (): Promise<ImportCliSessionsResult> => {
  try {
    return await importCliSessions();
  } catch (e) {
    return { imported: 0, skipped: 0, failed: 0, errors: [e instanceof Error ? e.message : String(e)] };
  }
});

// Defense-in-depth: aioncore conversation ids are short hex slugs; reject
// anything outside a safe charset before it reaches SQL/registry lookups
// (all SQL is parameterized — this only hardens against future regressions).
function isSafeConversationId(id: unknown): id is string {
  return typeof id === 'string' && /^[\w-]{1,64}$/.test(id);
}

ipcMain.handle(
  'ace:import-conversation-messages',
  async (_event, conversationId: string): Promise<ImportConversationMessagesResult> => {
    if (!isSafeConversationId(conversationId)) return { imported: 0, skipped: 0, unmapped: 0 };
    try {
      return await importConversationMessages(conversationId);
    } catch {
      return { imported: 0, skipped: 0, unmapped: 0 };
    }
  }
);

ipcMain.handle('ace:ensure-cli-resume', async (_event, conversationId: string): Promise<EnsureCliResumeResult> => {
  if (!isSafeConversationId(conversationId)) return { resumable: false, reason: 'error' };
  try {
    return await ensureCliSessionResumable(conversationId);
  } catch {
    return { resumable: false, reason: 'error' };
  }
});
