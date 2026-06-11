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

export const ACE_AIONCORE_COUPLED_SCHEMA = {
  /** Runtime table driving ACP session/load resume (migration v26). */
  acp_session: ['conversation_id', 'session_id', 'session_status', 'agent_backend'],
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

/** True when `table` exists and contains every column this fork depends on. */
export function hasCoupledSchema(db: SqliteDb, table: CoupledTable): boolean {
  // Runtime allowlist: the union type is compile-time only; never let an
  // unvetted string reach the PRAGMA interpolation below.
  if (!Object.hasOwn(ACE_AIONCORE_COUPLED_SCHEMA, table)) return false;
  let columns: PragmaColumn[];
  try {
    columns = db.pragma(`table_info(${table})`) as PragmaColumn[];
  } catch {
    return false;
  }
  if (!Array.isArray(columns) || columns.length === 0) return false;
  const names = new Set(columns.map((c) => c.name));
  return ACE_AIONCORE_COUPLED_SCHEMA[table].every((col) => names.has(col));
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
      SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.id NOT LIKE 'cli-%'
    )`;

/** Returns the number of conversations whose ordering was corrected. */
export function backfillImportedConversationActivity(db: SqliteRunDb): number {
  if (!hasCoupledSchema(db, 'conversations') || !hasCoupledSchema(db, 'messages')) return 0;
  const info = db.prepare(BACKFILL_IMPORTED_ACTIVITY_SQL).run() as { changes?: number | bigint };
  return Number(info?.changes ?? 0);
}
