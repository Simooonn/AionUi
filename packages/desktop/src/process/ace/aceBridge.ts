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
import {
  checkWorkspacesExist,
  deleteOpencodeSessions,
  resolveConversationFiles,
  unlinkSessionFiles,
} from './sessionFiles';
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

// Resolve on-disk session file paths (called before DB delete); ids gated.
ipcMain.handle('ace:resolve-conversation-files', async (_event, ids: string[]) => {
  try {
    const safe = Array.isArray(ids) ? ids.filter((id) => isSafeConversationId(id)) : [];
    return await resolveConversationFiles(safe);
  } catch {
    return {};
  }
});

// Delete on-disk session files (paths confined to CLI roots inside the impl).
ipcMain.handle('ace:unlink-session-files', async (_event, paths: string[]) => {
  try {
    return await unlinkSessionFiles(Array.isArray(paths) ? paths : []);
  } catch {
    return {};
  }
});

// Controlled opencode session-row delete (db path hardcoded + id shape gated inside).
ipcMain.handle('ace:delete-opencode-sessions', async (_event, sessionIds: string[]) => {
  const ids = Array.isArray(sessionIds) ? sessionIds : [];
  try {
    return await deleteOpencodeSessions(ids);
  } catch {
    // Per-id failure (not {}) so the renderer's fileDeleteFailed flag still fires.
    return Object.fromEntries(ids.map((id) => [String(id), { deleted: false, reason: 'delete-failed' }]));
  }
});

// Workspace existence map for sidebar gray-out.
ipcMain.handle('ace:check-workspaces-exist', async (_event, paths: string[]) => {
  try {
    return checkWorkspacesExist(Array.isArray(paths) ? paths : []);
  } catch {
    return {};
  }
});
