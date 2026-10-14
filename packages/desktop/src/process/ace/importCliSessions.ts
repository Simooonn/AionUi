/**
 * Idempotent import of local CLI sessions into the aioncore conversation list.
 *
 * Strategy (validated against the running backend):
 *  - The backend ignores a client-supplied `id` and rejects legacy types, so we
 *    create with type='acp' and carry the stable CLI session id in
 *    `extra.cli_session_id` (a persisted custom field).
 *  - Idempotency is enforced in userland: the "already imported" baseline is read
 *    straight from the aioncore sqlite file (read-only), so ARCHIVED rows count.
 *    The HTTP list endpoint excludes archived rows and once let archived sessions
 *    be re-imported as duplicates. Re-running imports nothing new.
 *  - Sessions aioncore points ANY conversation at (acp_session.session_id, orphan
 *    rows included) are AionUi's own and are never imported: a native
 *    conversation's CLI session lives in the user's project dir and was once
 *    imported as a duplicate of it.
 *  - A baseline that cannot be read — or that is empty while the HTTP list still
 *    reports imported rows — aborts the import with the reason: treating a missing
 *    baseline as "nothing imported yet" once mass-duplicated all 379 imported
 *    conversations (the list endpoint happened to return 500 at that moment).
 *    The tripwire keys on the imported half only.
 *  - `extra.backend` ('claude'|'codex') drives the sidebar icon; the presence of
 *    `cli_session_id` marks the conversation read-only in the renderer.
 *  - Sessions whose ORIGINAL cwd lies in an AionUi-internal dir (`.aionui*`
 *    segment, or the resolved `Library/Application Support/AionUi*` form) are
 *    dropped before scan and import.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix } from 'node:path';
import { ipcBridge } from '@/common';
import type {
  CliSessionMeta,
  ImportCliSessionsResult,
  ImportedConversationExtra,
  ScanCliSessionsResult,
} from '@/common/ace/types';
import { getDataPath } from '@process/utils';
import {
  ACE_IMPORT_BASELINE_SCHEMA,
  ACE_IMPORT_DEDUPE_SCHEMA,
  backfillImportedConversationActivity,
  findDuplicateImportLosers,
  hasImportSchema,
  type ImportSchemaRequirement,
  readAcpSessionIds,
  readImportedCliSessionIds,
  type SqliteQueryDb,
} from './aioncoreSchema';
import { parseClaudeCodeSessions } from './parsers/claudeParser';
import { parseCodexSessions } from './parsers/codexParser';
import { parseGeminiSessions } from './parsers/geminiParser';
import { parseOpencodeSessions } from './parsers/opencodeParser';

type CreateParams = Parameters<typeof ipcBridge.conversation.create.invoke>[0];

/** Main-process facts the import cannot learn from the DB; injected by aceBridge. */
export type ImportCliDeps = {
  /** True when the conversation still has an open embedded terminal (running or exited-but-not-closed). */
  hasOpenTerminal: (conversationId: string) => boolean;
};

/**
 * `TerminalManager.list()` keeps exited-but-not-closed entries, so a non-empty
 * list means "open" rather than "running" — the safer direction for a cleanup
 * guard. A null manager (bridge not initialised) cannot own any terminal.
 */
export function hasOpenTerminalIn(
  manager: { list: (conversationId: string) => readonly unknown[] } | null | undefined,
  conversationId: string
): boolean {
  return (manager?.list(conversationId).length ?? 0) > 0;
}

/** The better-sqlite3 surface the read path uses. */
type BackendDb = SqliteQueryDb & { close: () => void };

/** Zero-count result; `errors` carries the abort reason when the import never ran. */
export function emptyImportResult(errors: string[] = []): ImportCliSessionsResult {
  return { imported: 0, skipped: 0, failed: 0, errors, duplicatesRemoved: 0, duplicatesSkipped: 0, removedIds: [] };
}

type DbFailureReason = 'db-unavailable' | 'schema-mismatch' | 'query-failed';
type DbResult<T> = { ok: true; value: T } | { ok: false; reason: DbFailureReason; detail: string };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Open aionui-backend.db READ-ONLY, check `requirement`, run `fn`, always close.
 * `readonly` + `fileMustExist`: the read path can never write or create the
 * file, and a read-only handle skips the close-time WAL checkpoint a
 * read-write handle could trigger while the backend owns the database.
 */
async function withBackendDb<T>(requirement: ImportSchemaRequirement, fn: (db: BackendDb) => T): Promise<DbResult<T>> {
  let db: BackendDb;
  try {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    db = new BetterSqlite3(join(getDataPath(), 'aionui-backend.db'), {
      readonly: true,
      fileMustExist: true,
    }) as unknown as BackendDb;
  } catch (e) {
    return { ok: false, reason: 'db-unavailable', detail: errorText(e) };
  }
  try {
    db.pragma('busy_timeout = 5000');
    if (!hasImportSchema(db, requirement)) {
      return {
        ok: false,
        reason: 'schema-mismatch',
        detail: `aionui-backend.db lacks columns required for ${Object.keys(requirement).join('/')}`,
      };
    }
    return { ok: true, value: fn(db) };
  } catch (e) {
    return { ok: false, reason: 'query-failed', detail: errorText(e) };
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
}

type BaselineFailureReason = DbFailureReason | 'baseline-suspect' | 'list-failed';
type BaselineResult = { ok: true; ids: Set<string> } | { ok: false; reason: BaselineFailureReason; detail: string };

/**
 * The CLI session ids that must not be imported — already imported (archived
 * rows included) or pointed at by aioncore for any conversation (acp_session,
 * orphan rows included) — or the reason the import must NOT proceed. An EMPTY
 * imported half is cross-checked against the HTTP list: if the list still
 * reports imported rows the DB read is lying (schema/semantic drift) — a true
 * first import has both sides empty.
 */
async function readImportBaseline(): Promise<BaselineResult> {
  const res = await withBackendDb(ACE_IMPORT_BASELINE_SCHEMA, (db) => ({
    imported: readImportedCliSessionIds(db),
    owned: readAcpSessionIds(db),
  }));
  if (res.ok === false) return res;
  const { imported, owned } = res.value;
  const ids = new Set([...imported, ...owned]);
  console.info('[ace:import] baseline', { imported: imported.size, owned: owned.size, union: ids.size });
  // The tripwire keys on the IMPORTED half only: a non-empty acp_session must
  // never mask a conversations read that silently returns nothing.
  if (imported.size > 0) return { ok: true, ids };
  try {
    const list = await ipcBridge.database.getUserConversations.invoke({ limit: 10000 });
    const suspect = (list?.items ?? []).some((c) => {
      const sid = (c.extra as { cli_session_id?: unknown } | undefined)?.cli_session_id;
      return typeof sid === 'string' && sid !== '';
    });
    if (suspect) {
      return {
        ok: false,
        reason: 'baseline-suspect',
        detail: 'DB baseline is empty but the conversation list reports imported rows',
      };
    }
  } catch (e) {
    return { ok: false, reason: 'list-failed', detail: errorText(e) };
  }
  return { ok: true, ids };
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

// AionUi-internal workspaces must never be imported: the app's own ACP transcripts
// and the shared live-verification workspace (~/.aionui/live-verify) live there.
// claudeParser drops such project dirs by name marker; this is the backend-agnostic
// twin applied to the ORIGINAL cwd of every parsed session (codex / gemini /
// opencode carry no marker). Two path forms exist on macOS because `~/.aionui` is
// a symlink created by getDataPath (process/utils/utils.ts):
//   logical   …/.aionui*/…                              (as passed, e.g. codex)
//   resolved  …/Library/Application Support/AionUi*/…  (realpath, e.g. claude/opencode)
const AIONUI_DOT_DIR_PREFIX = '.aionui';
const AIONUI_APP_SUPPORT_PARENTS = ['Library', 'Application Support'] as const;
const AIONUI_APP_SUPPORT_PREFIX = 'AionUi';

/** True when the original CLI cwd lies in an AionUi-internal dir, in either path form. */
export function isAionUiInternalWorkspace(workspace: string | undefined): boolean {
  if (!workspace) return false;
  // Pure: normalise separators and `..` without touching the filesystem.
  const segments = posix.normalize(workspace.replace(/\\/g, '/')).split('/').filter(Boolean);
  return segments.some(
    (segment, i) =>
      segment.startsWith(AIONUI_DOT_DIR_PREFIX) ||
      (segment === AIONUI_APP_SUPPORT_PARENTS[0] &&
        segments[i + 1] === AIONUI_APP_SUPPORT_PARENTS[1] &&
        (segments[i + 2]?.startsWith(AIONUI_APP_SUPPORT_PREFIX) ?? false))
  );
}

/** Drop sessions whose original cwd is AionUi-internal; pure, shared by scan and import. */
export function filterImportableSessions(metas: readonly CliSessionMeta[]): CliSessionMeta[] {
  return metas.filter((meta) => !isAionUiInternalWorkspace(meta.workspace));
}

function parseAllCliSessions(): CliSessionMeta[] {
  return filterImportableSessions([
    ...parseClaudeCodeSessions(),
    ...parseCodexSessions(),
    ...parseGeminiSessions(),
    ...parseOpencodeSessions(),
  ]);
}

/**
 * Dry-run scan for the pre-import confirmation dialog: how many NEW sessions
 * an import would create, per source. Returns null when the baseline is
 * unavailable (same abort condition as the import itself).
 */
export async function scanCliSessions(): Promise<ScanCliSessionsResult | null> {
  const baseline = await readImportBaseline();
  if (baseline.ok === false) {
    console.warn('[ace:import] baseline unavailable:', baseline.reason, baseline.detail);
    return null;
  }
  const existing = baseline.ids;
  const result: ScanCliSessionsResult = {
    total: 0,
    bySource: { 'claude-code': 0, codex: 0, gemini: 0, opencode: 0 },
  };
  for (const meta of parseAllCliSessions()) {
    if (existing.has(meta.sessionId)) continue;
    result.total++;
    result.bySource[meta.source]++;
  }
  return result;
}

/**
 * Remove imported copies of a session that is already shown: a later import of
 * the same cli_session_id, or any import of a session a native conversation owns
 * through acp_session (the native row always survives).
 * Only data-less copies go: a loser with in-app turns, a cron binding or an open
 * terminal is kept and counted in `duplicatesSkipped`. Deletion goes through the
 * backend's single-item endpoints only — NEVER through sessionFiles /
 * deleteWithLocalFiles, which would unlink the CLI file the survivor still uses.
 * A cleanup-side schema mismatch degrades to an `errors` entry; the import stands.
 */
async function cleanupDuplicateImports(result: ImportCliSessionsResult, deps: ImportCliDeps): Promise<void> {
  const losers = await withBackendDb(ACE_IMPORT_DEDUPE_SCHEMA, findDuplicateImportLosers);
  if (losers.ok === false) {
    result.errors.push(`cleanup skipped: ${losers.reason}: ${losers.detail}`);
    return;
  }
  for (const loser of losers.value) {
    // A failing terminal check must not escape (the import loop already ran);
    // treat "unknown" as protected — the safe direction for a delete guard.
    let openTerminal = true;
    try {
      openTerminal = deps.hasOpenTerminal(loser.id);
    } catch (e) {
      result.errors.push(`cleanup ${loser.cliSessionId}: terminal check failed, kept: ${errorText(e)}`);
    }
    if (loser.hasLiveTurns || loser.hasCronJobs || openTerminal) {
      result.duplicatesSkipped++;
      console.info('[ace:import] duplicate kept (protected)', { ...loser, openTerminal });
      continue;
    }
    try {
      if (loser.archived) {
        // Archived rows are only reachable through the archive endpoint.
        await ipcBridge.sidebar.deleteArchivedItem.invoke({ item_type: 'conversation', item_id: loser.id });
      } else {
        await ipcBridge.conversation.remove.invoke({ id: loser.id });
      }
      result.duplicatesRemoved++;
      result.removedIds.push(loser.id);
      console.info('[ace:import] duplicate removed', {
        id: loser.id,
        cliSessionId: loser.cliSessionId,
        archived: loser.archived,
      });
    } catch (e) {
      result.errors.push(`cleanup ${loser.cliSessionId}: ${errorText(e)}`);
    }
  }
}

/**
 * Import all local CLI sessions (Claude Code / Codex / Gemini / OpenCode);
 * idempotent across repeated runs, then clean up protected-aware duplicates.
 */
export async function importCliSessions(deps: ImportCliDeps): Promise<ImportCliSessionsResult> {
  const result = emptyImportResult();
  const sessions = parseAllCliSessions();
  const baseline = await readImportBaseline();
  if (baseline.ok === false) {
    // Without a trustworthy dedup baseline every create could be a duplicate — refuse.
    result.failed = sessions.length;
    result.errors.push(
      `aborted: imported-session baseline unavailable (${baseline.reason}: ${baseline.detail}) — not importing to avoid duplicates`
    );
    return result;
  }
  const existing = baseline.ids;

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

  // Duplicate cleanup runs AFTER the import loop so duplicates created by a
  // concurrent run in this very pass are caught too, and BEFORE the backfill.
  await cleanupDuplicateImports(result, deps);

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
