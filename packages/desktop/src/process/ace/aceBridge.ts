/**
 * Self-registering IPC handler for the "import CLI sessions" fork feature.
 * Registered by a side-effect import from process/bridge/index.ts.
 */

import { ipcMain } from 'electron';
import type { ImportCliSessionsResult } from '@/common/ace/types';
import { importCliSessions } from './importCliSessions';

ipcMain.handle('ace:import-cli-sessions', async (): Promise<ImportCliSessionsResult> => {
  try {
    return await importCliSessions();
  } catch (e) {
    return { imported: 0, skipped: 0, failed: 0, errors: [e instanceof Error ? e.message : String(e)] };
  }
});
