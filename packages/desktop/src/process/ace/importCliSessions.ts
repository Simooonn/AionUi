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
import { ipcBridge } from '@/common';
import type { CliSessionMeta, ImportCliSessionsResult, ImportedConversationExtra } from '@/common/ace/types';
import { parseClaudeCodeSessions } from './claudeParser';
import { parseCodexSessions } from './codexParser';

type CreateParams = Parameters<typeof ipcBridge.conversation.create.invoke>[0];

async function fetchExistingCliSessionIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const res = await ipcBridge.database.getUserConversations.invoke({ limit: 10000 });
    for (const c of res?.items ?? []) {
      const cid = (c.extra as { cli_session_id?: string } | undefined)?.cli_session_id;
      if (cid) ids.add(cid);
    }
  } catch {
    // Best-effort: if listing fails, proceed with an empty set rather than aborting.
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
  return result;
}
