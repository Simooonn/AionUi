/**
 * Single source of truth for the aioncore private sqlite schema this fork
 * direct-writes. aioncore is a closed prebuilt binary: these tables are NOT a
 * public API and may change on upgrade.
 *
 * Upgrade checklist (referenced from ACE_CHANGES.md): after bumping
 * aioncoreVersion, verify every table/column listed here still exists
 * (`PRAGMA table_info`). All direct writers derive their runtime schema
 * defense from this constant, so a mismatch degrades gracefully instead of
 * crashing.
 */

export const CLI_ROW_ID_PREFIX = 'cli-';
export const CHAT_ACTIVITY_TYPES = ['text', 'thinking', 'tool_call', 'tool_group', 'acp_tool_call', 'plan'] as const;

/**
 * One read snapshot; malformed metadata must not abort other conversations.
 * SQLite's 1e999 is infinity: exclude it before MAX so it cannot hide valid rows.
 */
export const CONVERSATION_ACTIVITY_TIMES_SQL = `SELECT c.id AS id, c.created_at AS created_at,
  (SELECT MAX(m.created_at) FROM messages m
    WHERE m.conversation_id = c.id AND m.hidden = 0
      AND m.type IN (${CHAT_ACTIVITY_TYPES.map((type) => `'${type}'`).join(', ')})
      AND typeof(m.created_at) IN ('integer', 'real') AND m.created_at >= 1000000000000
      AND m.created_at < 1e999) AS msg_at,
  CASE WHEN json_valid(c.extra) THEN
    CASE WHEN json_type(c.extra, '$.cli_session_id') = 'text'
          AND length(trim(json_extract(c.extra, '$.cli_session_id'))) > 0
          AND json_type(c.extra, '$.cli_source') = 'text'
          AND length(trim(json_extract(c.extra, '$.cli_source'))) > 0
          AND json_type(c.extra, '$.cli_updated_at') IN ('integer', 'real')
          AND json_extract(c.extra, '$.cli_updated_at') >= 1000000000000
          AND json_extract(c.extra, '$.cli_updated_at') < 1e999
          AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.conversation_id = c.id AND x.id LIKE '${CLI_ROW_ID_PREFIX}%')
      THEN json_extract(c.extra, '$.cli_updated_at') END
    END AS cli_at
  FROM conversations c`;

export const ACE_AIONCORE_COUPLED_SCHEMA = {
  /** Runtime table driving ACP session/load resume (v0.1.41 split agent_backend into agent_source + agent_id). */
  acp_session: ['conversation_id', 'session_id', 'session_status', 'agent_source', 'agent_id'],
  /** Agent catalog; acp_session.agent_id points here, backend names the CLI ('claude', 'codex', ...). */
  agent_metadata: ['id', 'backend'],
  /** Display table for chat history (lazy jsonl sync writes here). */
  messages: ['id', 'conversation_id', 'msg_id', 'type', 'content', 'position', 'status', 'hidden', 'created_at'],
  /** List table; updated_at drives sidebar ordering (renderer modified_at). */
  conversations: ['id', 'updated_at', 'extra'],
} as const;

export type CoupledTable = keyof typeof ACE_AIONCORE_COUPLED_SCHEMA;

type PragmaColumn = { name: string };

type SqliteDb = {
  pragma: (sql: string) => unknown;
};

/** True when `table` exists and contains every column in `cols` (PRAGMA table_info). */
function tableHasColumns(db: SqliteDb, table: string, cols: readonly string[]): boolean {
  let columns: PragmaColumn[];
  try {
    columns = db.pragma(`table_info(${table})`) as PragmaColumn[];
  } catch {
    return false;
  }
  if (!Array.isArray(columns) || columns.length === 0) return false;
  const names = new Set(columns.map((c) => c.name));
  return cols.every((col) => names.has(col));
}

/** True when `table` exists and contains every column this fork depends on. */
export function hasCoupledSchema(db: SqliteDb, table: CoupledTable): boolean {
  // Runtime allowlist: the union type is compile-time only; never let an
  // unvetted string reach the PRAGMA interpolation below.
  if (!Object.hasOwn(ACE_AIONCORE_COUPLED_SCHEMA, table)) return false;
  return tableHasColumns(db, table, ACE_AIONCORE_COUPLED_SCHEMA[table]);
}

/** Keep the new read contract separate so legacy writer/schema guards stay unchanged. */
export function hasConversationActivitySchema(db: SqliteDb): boolean {
  return (
    tableHasColumns(db, 'conversations', ['id', 'created_at', 'extra']) &&
    tableHasColumns(db, 'messages', ['id', 'conversation_id', 'type', 'hidden', 'created_at'])
  );
}

// --- CLI-import dedupe (baseline read + duplicate cleanup) -------------------
// Kept separate from ACE_AIONCORE_COUPLED_SCHEMA on purpose: that list gates
// activity touch / backfill / local-file resolution, and widening it would let
// one schema drift disable unrelated features (e.g. permanent-delete file
// cleanup). The baseline read needs conversations.extra plus acp_session.session_id;
// the cleanup query additionally needs ranking, archive state, native ownership
// and live-turn / cron checks.

/** Columns the baseline read touches: imported sids + sids aioncore bound to any conversation. */
export const ACE_IMPORT_BASELINE_SCHEMA = {
  conversations: ['id', 'extra'],
  acp_session: ['session_id'],
} as const;
/** Columns the duplicate cleanup query touches (ranking, archive state, native ownership, live turns, cron bindings). */
export const ACE_IMPORT_DEDUPE_SCHEMA = {
  conversations: ['id', 'user_id', 'extra', 'created_at', 'archived_at'],
  acp_session: ['conversation_id', 'session_id'],
  messages: ['id', 'conversation_id'],
  cron_jobs: ['id', 'conversation_id'],
} as const;

export type ImportSchemaRequirement = typeof ACE_IMPORT_BASELINE_SCHEMA | typeof ACE_IMPORT_DEDUPE_SCHEMA;

const IMPORT_SCHEMA_REQUIREMENTS: readonly ImportSchemaRequirement[] = [
  ACE_IMPORT_BASELINE_SCHEMA,
  ACE_IMPORT_DEDUPE_SCHEMA,
];

/**
 * True when every table/column in `requirement` exists. Only the two exported
 * requirement objects are accepted (reference equality), so table names never
 * come from outside this module.
 */
export function hasImportSchema(db: SqliteDb, requirement: ImportSchemaRequirement): boolean {
  if (!IMPORT_SCHEMA_REQUIREMENTS.includes(requirement)) return false;
  return (Object.entries(requirement) as Array<[string, readonly string[]]>).every(([table, cols]) =>
    tableHasColumns(db, table, cols)
  );
}

export type SqliteQueryDb = SqliteDb & {
  prepare: (sql: string) => { all: () => unknown[] };
};

/**
 * Every CLI session id already imported, regardless of archive state. Only
 * non-empty JSON strings count: `json_type` (not `typeof(json_extract())`,
 * which reports 'text' for object/array values too) and `<> ''`.
 */
export const IMPORTED_CLI_SESSION_IDS_SQL = `SELECT json_extract(extra, '$.cli_session_id') AS sid
  FROM conversations
  WHERE json_type(extra, '$.cli_session_id') = 'text'
    AND json_extract(extra, '$.cli_session_id') <> ''`;

export function readImportedCliSessionIds(db: SqliteQueryDb): Set<string> {
  const rows = db.prepare(IMPORTED_CLI_SESSION_IDS_SQL).all() as Array<{ sid: string }>;
  return new Set(rows.map((r) => r.sid));
}

/**
 * Every CLI session id aioncore currently points a conversation at (native or
 * resumed import), ORPHAN rows included. acp_session.session_id is a CURRENT
 * resume pointer, not a ledger: aioncore rewrites and clears it in place. Orphan
 * rows survive only because aioncore's conversation delete removes the row
 * first and its acp_session delete then matches nothing.
 */
export const ACP_SESSION_IDS_SQL = `SELECT session_id AS sid
  FROM acp_session
  WHERE typeof(session_id) = 'text'
    AND session_id <> ''`;

export function readAcpSessionIds(db: SqliteQueryDb): Set<string> {
  const rows = db.prepare(ACP_SESSION_IDS_SQL).all() as Array<{ sid: string }>;
  return new Set(rows.map((r) => r.sid));
}

/**
 * An imported copy that loses to the session's owner (a native conversation,
 * or the earliest import), with the facts that protect it.
 */
export type DuplicateImportLoser = {
  id: string;
  cliSessionId: string;
  archived: boolean;
  /** Has in-app turns (live message rows, i.e. ids NOT LIKE 'cli-%'). */
  hasLiveTurns: boolean;
  /** A cron job is bound to it (the backend DELETE would cascade to the job). */
  hasCronJobs: boolean;
};

/**
 * Duplicate groups: same user, same non-empty text session id, claimed by
 * imported rows (extra.cli_session_id, fork copies excluded) or by native rows
 * (their acp_session pointer). The survivor is a native claimant, else the
 * EARLIEST import (created_at, then rowid); only imports are ever losers.
 * Protection flags are computed in the OUTER query so they can never change who
 * the survivor is. Output order is fixed so callers/tests can rely on it.
 */
export const DUPLICATE_IMPORT_LOSERS_SQL = `WITH claims AS (
    SELECT c.id, c.user_id, c.archived_at, c.created_at, c.rowid AS rid,
           json_extract(c.extra, '$.cli_session_id') AS sid, 1 AS imported
      FROM conversations c
     WHERE json_type(c.extra, '$.cli_session_id') = 'text'
       AND json_extract(c.extra, '$.cli_session_id') <> ''
       AND json_extract(c.extra, '$.fork') IS NULL
    UNION ALL
    -- The JOIN drops orphan acp_session rows (nothing left to protect); the
    -- json_type guard drops every imported conversation's own acp_session row,
    -- so an import never claims for itself even after aioncore re-points it.
    SELECT c.id, c.user_id, c.archived_at, c.created_at, c.rowid,
           a.session_id, 0
      FROM acp_session a
      JOIN conversations c ON c.id = a.conversation_id
     WHERE typeof(a.session_id) = 'text'
       AND a.session_id <> ''
       AND json_type(c.extra, '$.cli_session_id') IS NOT 'text'
  )
SELECT r.id, r.sid AS cliSessionId,
       (r.archived_at IS NOT NULL) AS archived,
       EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = r.id AND m.id NOT LIKE '${CLI_ROW_ID_PREFIX}%') AS hasLiveTurns,
       EXISTS (SELECT 1 FROM cron_jobs j WHERE j.conversation_id = r.id) AS hasCronJobs
  FROM (
    SELECT claims.*,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, sid
             ORDER BY imported ASC, created_at ASC, rid ASC
           ) AS rn
      FROM claims
  ) AS r
 WHERE r.rn > 1
   AND r.imported = 1
 ORDER BY r.user_id, r.sid, r.rn`;

export function findDuplicateImportLosers(db: SqliteQueryDb): DuplicateImportLoser[] {
  const rows = db.prepare(DUPLICATE_IMPORT_LOSERS_SQL).all() as Array<{
    id: string;
    cliSessionId: string;
    archived: number;
    hasLiveTurns: number;
    hasCronJobs: number;
  }>;
  // SQLite returns 0/1 for EXISTS / IS NOT NULL.
  return rows.map((r) => ({
    id: r.id,
    cliSessionId: r.cliSessionId,
    archived: Boolean(r.archived),
    hasLiveTurns: Boolean(r.hasLiveTurns),
    hasCronJobs: Boolean(r.hasCronJobs),
  }));
}

// --- Coupled write helpers (sidebar activity ordering) -----------------------
// The sidebar sorts by the conversation's updated_at (exposed to the renderer
// as modified_at). For CLI-imported conversations that value is the IMPORT
// time, not the session's real last activity, so ordering must be corrected
// from the CLI session files. Named-parameter SQL uses the ':name' prefix,
// accepted by both better-sqlite3 (runtime) and node:sqlite (tests).

type SqliteRunDb = SqliteDb & {
  prepare: (sql: string) => { run: (params?: Record<string, unknown>) => unknown };
};

/** Forward-only bump: never reorders below in-app activity. */
export const TOUCH_FORWARD_SQL = 'UPDATE conversations SET updated_at = :ts WHERE id = :cid AND updated_at < :ts';
/** Exact set (rewind allowed): safe only when the conversation has no in-app turns. */
export const TOUCH_EXACT_SQL = 'UPDATE conversations SET updated_at = :ts WHERE id = :cid AND updated_at <> :ts';

/**
 * Reflect a CLI session's latest on-disk activity into sidebar ordering.
 * `hasLiveRows` = the conversation has in-app turns; then only forward bumps
 * are allowed (in-app activity legitimately outranks an older jsonl record).
 */
export function touchConversationActivity(
  db: SqliteRunDb,
  conversationId: string,
  activityTs: number | undefined,
  hasLiveRows: boolean
): void {
  if (!activityTs || !Number.isFinite(activityTs) || activityTs <= 0) return;
  if (!hasCoupledSchema(db, 'conversations')) return;
  // MUST be an integer: binding a float (e.g. statSync().mtimeMs from
  // extra.cli_updated_at) stores REAL into the INTEGER column, and aioncore's
  // i64 row deserialization then 500s the ENTIRE conversation list endpoint.
  const ts = Math.round(activityTs);
  db.prepare(hasLiveRows ? TOUCH_FORWARD_SQL : TOUCH_EXACT_SQL).run({ ts, cid: conversationId });
}

/**
 * Batch backfill for imported conversations: rewind updated_at (= import time)
 * to extra.cli_updated_at (the CLI session's real last activity), but only for
 * conversations that never had an in-app turn (no live, non-`cli-` message
 * rows). Idempotent: a second run changes nothing.
 */
export const BACKFILL_IMPORTED_ACTIVITY_SQL = `UPDATE conversations
  SET updated_at = CAST(json_extract(extra, '$.cli_updated_at') AS INTEGER)
  WHERE json_extract(extra, '$.cli_session_id') IS NOT NULL
    AND CAST(json_extract(extra, '$.cli_updated_at') AS INTEGER) > 0
    AND updated_at <> CAST(json_extract(extra, '$.cli_updated_at') AS INTEGER)
    AND NOT EXISTS (
      SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.id NOT LIKE '${CLI_ROW_ID_PREFIX}%'
    )`;

/** Returns the number of conversations whose ordering was corrected. */
export function backfillImportedConversationActivity(db: SqliteRunDb): number {
  if (!hasCoupledSchema(db, 'conversations') || !hasCoupledSchema(db, 'messages')) return 0;
  const info = db.prepare(BACKFILL_IMPORTED_ACTIVITY_SQL).run() as { changes?: number | bigint };
  return Number(info?.changes ?? 0);
}
