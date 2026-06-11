/**
 * Idempotent import of local CLI sessions into the aioncore conversation list.
 *
 * Strategy (validated against the running backend):
 *  - The backend ignores a client-supplied `id` and rejects legacy types, so we
 *    create with type='acp' and carry the stable CLI session id in
 *    `extra.cli_session_id` (a persisted custom field).
 *  - Idempotency is enforced in userland: list existing conversations and skip any
 *    whose extra.cli_session_id is already present. Re-running imports nothing new.
 *  - `extra.backend` ('claude'|'codex') drives the sidebar icon; its presence of
 *    `cli_session_id` marks the conversation read-only in the renderer.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ipcBridge } from '@/common';
import type { CliSessionMeta, ImportCliSessionsResult, ImportedConversationExtra } from '@/common/ace/types';
import { getDataPath } from '@process/utils';
import { backfillImportedConversationActivity } from './aioncoreSchema';
import { parseClaudeCodeSessions } from './claudeParser';
import { parseCodexSessions } from './codexParser';

type CreateParams = Parameters<typeof ipcBridge.conversation.create.invoke>[0];

/**
 * Returns the cli_session_ids already imported, or null when the listing
 * FAILED. Failure MUST abort the import: treating it as an empty set once
 * mass-duplicated all 379 imported conversations (the list endpoint happened
 * to be returning 500 at that moment, so the idempotency prefilter saw
 * "nothing imported yet" and re-created everything).
 */
async function fetchExistingCliSessionIds(): Promise<Set<string> | null> {
  const ids = new Set<string>();
  try {
    const res = await ipcBridge.database.getUserConversations.invoke({ limit: 10000 });
    for (const c of res?.items ?? []) {
      const cid = (c.extra as { cli_session_id?: string } | undefined)?.cli_session_id;
      if (cid) ids.add(cid);
    }
  } catch {
    return null;
  }
  return ids;
}

// The backend rejects acp conversations whose workspace path no longer exists
// ("Workspace path is unavailable"). Imported sessions are read-only, so fall back
// to the home dir while preserving the original cwd in extra.cli_cwd for display.
function resolveWorkspace(original?: string): string {
  if (original && existsSync(original)) return original;
  return homedir();
}

function buildCreateParams(meta: CliSessionMeta): CreateParams {
  const extra: ImportedConversationExtra = {
    backend: meta.backend,
    workspace: resolveWorkspace(meta.workspace),
    cli_session_id: meta.sessionId,
    cli_source: meta.source,
    cli_cwd: meta.workspace,
    cli_created_at: meta.createdAt,
    cli_updated_at: meta.updatedAt,
  };
  // extra carries custom keys the backend persists but the typed params don't model.
  return { type: 'acp', name: meta.title, extra } as unknown as CreateParams;
}

/** Import all local CLI sessions (Claude Code + Codex); idempotent across repeated runs. */
export async function importCliSessions(): Promise<ImportCliSessionsResult> {
  const result: ImportCliSessionsResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const sessions = [...parseClaudeCodeSessions(), ...parseCodexSessions()];
  const existing = await fetchExistingCliSessionIds();
  if (existing === null) {
    // Without the dedup baseline every create would be a duplicate — refuse.
    result.failed = sessions.length;
    result.errors.push('aborted: could not list existing conversations (backend unavailable?) — retry later');
    return result;
  }
  if (existing.size === 0) {
    // Cross-check 200-but-empty against the DB directly: a broken list response
    // (e.g. pagination regression) would otherwise mass-duplicate just the same.
    try {
      const BetterSqlite3 = (await import('better-sqlite3')).default;
      const db = new BetterSqlite3(join(getDataPath(), 'aionui-backend.db'));
      try {
        db.pragma('busy_timeout = 5000');
        const row = db
          .prepare("SELECT COUNT(*) c FROM conversations WHERE json_extract(extra, '$.cli_session_id') IS NOT NULL")
          .get() as { c: number };
        if (row.c > 0) {
          result.failed = sessions.length;
          result.errors.push('aborted: list returned empty but DB already has imported conversations — retry later');
          return result;
        }
      } finally {
        db.close();
      }
    } catch {
      /* sqlite unavailable → trust the HTTP result (true first import) */
    }
  }

  for (const meta of sessions) {
    if (existing.has(meta.sessionId)) {
      result.skipped++;
      continue;
    }
    try {
      await ipcBridge.conversation.create.invoke(buildCreateParams(meta));
      existing.add(meta.sessionId);
      result.imported++;
    } catch (e) {
      result.failed++;
      result.errors.push(`${meta.sessionId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Sidebar ordering backfill: created conversations get updated_at = NOW (the
  // import time), so the whole batch sorts as one clump. Rewind each imported
  // conversation (with no in-app turns) to its real CLI last-activity time.
  // Best-effort: ordering is cosmetic, never fail the import over it.
  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(join(getDataPath(), 'aionui-backend.db'));
    try {
      db.pragma('busy_timeout = 5000');
      backfillImportedConversationActivity(db);
    } finally {
      db.close();
    }
  } catch {
    /* best-effort */
  }
  return result;
}
