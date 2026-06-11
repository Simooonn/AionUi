/**
 * Wire a CLI-imported conversation for true ACP resume.
 *
 * Empirical ground truth (runtime spikes against the live backend):
 * - aioncore resumes a session iff its private `acp_session.session_id` is set;
 *   `conversations.extra.acp_session_id` is ignored and cleared.
 * - The session id space is shared: the jsonl filename uuid IS the id that
 *   session/load → SDK `query({resume})` accepts.
 * - A warm agent process holds the session in memory and ignores DB writes, so
 *   the write only takes effect against a cold agent → evict idle agents first.
 * - aioncore clears session_id during error cleanup → the write must be
 *   idempotent and repeated (on conversation open and before every send).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isAgentProcessTreeAlive,
  readAgentProcessRegistry,
  terminateAgentProcess,
  type RegisteredAgentProcess,
} from '@aionui/web-host';
import { ipcBridge } from '@/common';
import type { CliSource, EnsureCliResumeResult } from '@/common/ace/types';
import { getDataPath } from '@process/utils';
import { hasCoupledSchema } from './aioncoreSchema';
import { findSessionFile } from './messageParser';

const BACKEND_DB = 'aionui-backend.db';
const EVICT_GRACE_MS = 1500;
const ROW_POLL_TOTAL_MS = 3000;
const ROW_POLL_STEP_MS = 250;

type Db = import('better-sqlite3').Database;

type AcpSessionRow = { session_id: string | null; session_status: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readImportedExtra(db: Db, conversationId: string): { sessionId: string; source: CliSource } | null {
  const conv = db.prepare('SELECT extra FROM conversations WHERE id = ?').get(conversationId) as
    | { extra?: string }
    | undefined;
  if (!conv) return null;
  try {
    const extra = JSON.parse(conv.extra ?? '{}') as { cli_session_id?: string; cli_source?: CliSource };
    if (!extra.cli_session_id || !extra.cli_source) return null;
    return { sessionId: extra.cli_session_id, source: extra.cli_source };
  } catch {
    return null;
  }
}

function getAcpSessionRow(db: Db, conversationId: string): AcpSessionRow | undefined {
  return db
    .prepare('SELECT session_id, session_status FROM acp_session WHERE conversation_id = ?')
    .get(conversationId) as AcpSessionRow | undefined;
}

function liveAgentEntries(processes: RegisteredAgentProcess[], conversationId: string): RegisteredAgentProcess[] {
  return processes.filter((p) => p.conversation_id === conversationId && isAgentProcessTreeAlive(p));
}

/**
 * Evict warm (idle) agent processes for this conversation so the next prompt
 * re-reads acp_session from the DB. SIGTERM → grace → SIGKILL escalation,
 * mirroring web-host's own cleanup strategy.
 * Returns false when a process survives even SIGKILL.
 */
async function evictConversationAgents(dataDir: string, conversationId: string): Promise<boolean> {
  const entries = liveAgentEntries(await readAgentProcessRegistry(dataDir), conversationId);
  if (!entries.length) return true;

  for (const entry of entries) await terminateAgentProcess(entry, 'SIGTERM');

  const deadline = Date.now() + EVICT_GRACE_MS;
  while (Date.now() < deadline) {
    if (!entries.some((e) => isAgentProcessTreeAlive(e))) return true;
    await sleep(100);
  }

  for (const entry of entries) {
    if (isAgentProcessTreeAlive(entry)) await terminateAgentProcess(entry, 'SIGKILL');
  }
  await sleep(100);
  return !entries.some((e) => isAgentProcessTreeAlive(e));
}

let warnedSchemaMismatch = false;

/**
 * Idempotently point aioncore's acp_session row at the imported CLI session so
 * the next prompt performs a true session/load resume. Transient failures
 * (busy / row-not-ready) are expected and retried by callers on the next
 * open/send.
 */
export async function ensureCliSessionResumable(conversationId: string): Promise<EnsureCliResumeResult> {
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const dataDir = getDataPath();
  const db: Db = new BetterSqlite3(join(dataDir, BACKEND_DB));
  try {
    db.pragma('busy_timeout = 5000');

    const imported = readImportedExtra(db, conversationId);
    if (!imported) return { resumable: false, reason: 'not-imported' };

    if (!hasCoupledSchema(db, 'acp_session')) {
      if (!warnedSchemaMismatch) {
        warnedSchemaMismatch = true;
        console.warn(
          '[ace:sessionResume] acp_session schema mismatch — degrading to fresh-continue (aioncore upgraded?)'
        );
      }
      return { resumable: false, reason: 'schema-mismatch' };
    }

    const sessionFile = findSessionFile(imported.source, imported.sessionId);
    if (!sessionFile || !existsSync(sessionFile)) return { resumable: false, reason: 'jsonl-missing' };

    let row = getAcpSessionRow(db, conversationId);
    if (!row) {
      // Never warmed up: let aioncore create the row with its own agent_id
      // (warmup is a 202-async HTTP adapter, callable from main; spike 1
      // verified warmup alone never creates a new CLI session file).
      try {
        await ipcBridge.conversation.warmup.invoke({ conversation_id: conversationId });
      } catch {
        /* fall through to polling — warmup may already be in flight */
      }
      const deadline = Date.now() + ROW_POLL_TOTAL_MS;
      while (!row && Date.now() < deadline) {
        await sleep(ROW_POLL_STEP_MS);
        row = getAcpSessionRow(db, conversationId);
      }
      if (!row) return { resumable: false, reason: 'row-not-ready' };
    }

    if (row.session_status !== 'idle') return { resumable: false, reason: 'busy' };

    if (row.session_id === imported.sessionId) {
      // Already wired. A live agent (if any) was spawned AFTER this value was
      // set and consumed it during warmup (log-verified: session opens with the
      // CLI session id). Evicting it here would sever aioncore's in-flight ACP
      // connection and fail the very send we're wiring ("Broken pipe" →
      // -32603), and also break set_model ("Active agent not found").
      return { resumable: true };
    }

    // session_id is NULL or stale: a warm agent holds the wrong in-memory
    // session and would ignore the DB write entirely (spike-verified), so
    // recreate the cold-agent precondition before pointing the row at the CLI
    // session.
    if (!(await evictConversationAgents(dataDir, conversationId))) {
      return { resumable: false, reason: 'busy' };
    }

    db.prepare(
      'UPDATE acp_session SET session_id = @sid WHERE conversation_id = @cid AND (session_id IS NULL OR session_id <> @sid)'
    ).run({ sid: imported.sessionId, cid: conversationId });

    // Respawn-race re-check (narrows but cannot eliminate the window — the
    // registry is async-written by the closed binary; the before-send
    // re-ensure is the real backstop).
    if (liveAgentEntries(await readAgentProcessRegistry(dataDir), conversationId).length) {
      return { resumable: false, reason: 'busy' };
    }

    return { resumable: true };
  } catch (e) {
    // Log message only — full exception objects can leak paths/schema details
    // into logs that may be shipped with feedback bundles.
    console.warn('[ace:sessionResume] unexpected failure:', e instanceof Error ? e.message : String(e));
    return { resumable: false, reason: 'error' };
  } finally {
    db.close();
  }
}
