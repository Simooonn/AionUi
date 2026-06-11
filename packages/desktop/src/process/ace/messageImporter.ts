/**
 * Lazily import a CLI conversation's message history into the aioncore sqlite DB.
 *
 * Verified by probe: directly writing the `messages` table of aionui-backend.db is
 * read back immediately by aioncore over HTTP (it does not cache messages). We use
 * better-sqlite3 (main process) with INSERT OR IGNORE for idempotent incremental import
 * keyed by a stable per-item message id.
 *
 * Cross-channel dedup: turns sent from inside the app are written to `messages`
 * by aioncore (live rows) AND appended to the CLI's own jsonl. Live row ids never
 * match our `cli-` ids, so INSERT OR IGNORE cannot catch this duplication. A jsonl
 * record is skipped only when BOTH factors match a live row: same content key
 * (position + normalized text) AND timestamps within a 10-minute window — verbatim
 * repeats outside the window are kept, and normalization drift degrades to a
 * visible duplicate instead of a silent drop.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDataPath } from '@process/utils';
import type { CliSource, ImportConversationMessagesResult, ParsedCliMessage } from '@/common/ace/types';
import { touchConversationActivity } from './aioncoreSchema';
import { parseSessionMessages } from './messageParser';

const BACKEND_DB = 'aionui-backend.db';
const DEDUP_WINDOW_MS = 10 * 60_000;

/**
 * Ids written by the pre-fix positional Codex scheme (`cli-codex-<idx>-<i>`).
 * That scheme collided GLOBALLY across Codex conversations (messages.id is the
 * primary key), so the first imported conversation stole every id and later
 * ones silently imported nothing (or partial garbage). Rows matching this
 * pattern are purged per conversation before re-importing with the fixed
 * session-scoped scheme (`cli-codex-<sessionId>-<idx>-<i>`).
 */
export const LEGACY_CODEX_ID = /^cli-codex-\d+-\d+$/;

type MessageRow = {
  id: string;
  conversation_id: string;
  msg_id: string;
  type: string;
  content: string;
  position: string;
  status: string;
  hidden: number;
  created_at: number;
};

/** content-key → created_at list of live (non-cli) rows. */
export type LiveRowIndex = Map<string, number[]>;

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contentKey(position: string, text: string): string {
  return createHash('sha1')
    .update(`${position}|${normalizeText(text)}`)
    .digest('hex');
}

type LiveRow = { content: string; position: string; created_at: number };

/** Index live-turn rows (written by aioncore, id NOT LIKE 'cli-%') for dedup. */
export function buildLiveRowIndex(rows: LiveRow[]): LiveRowIndex {
  const index: LiveRowIndex = new Map();
  for (const row of rows) {
    let text: string | undefined;
    try {
      const parsed = JSON.parse(row.content) as { content?: unknown };
      if (typeof parsed.content === 'string') text = parsed.content;
    } catch {
      /* non-JSON live content → not comparable, skip */
    }
    if (!text) continue;
    const key = contentKey(row.position, text);
    const list = index.get(key);
    if (list) list.push(row.created_at);
    else index.set(key, [row.created_at]);
  }
  return index;
}

/** Dual-factor duplicate check: content key AND |Δt| < window (both epoch ms). */
export function isLiveDuplicate(index: LiveRowIndex, position: string, text: string, createdAt?: number): boolean {
  if (createdAt === undefined) return false; // no timestamp → cannot window-match, keep the record
  const list = index.get(contentKey(position, text));
  if (!list) return false;
  return list.some((t) => Math.abs(t - createdAt) < DEDUP_WINDOW_MS);
}

function mapRows(
  conversationId: string,
  messages: ParsedCliMessage[],
  liveIndex: LiveRowIndex
): { rows: MessageRow[]; unmapped: number } {
  const rows: MessageRow[] = [];
  let unmapped = 0;
  for (const m of messages) {
    m.items.forEach((item, i) => {
      const created_at = m.createdAt ?? Date.now();
      if (item.kind !== 'text' && item.kind !== 'thinking') {
        unmapped += 1;
        return;
      }
      const position = item.kind === 'text' && m.role === 'user' ? 'right' : 'left';
      // Dedup probes the RAW m.createdAt (not the Date.now() fallback above) so
      // records without a CLI timestamp are conservatively kept, never dropped.
      if (isLiveDuplicate(liveIndex, position, item.text, m.createdAt)) return; // already written live by aioncore
      rows.push({
        id: `cli-${m.msgId}-${i}`,
        conversation_id: conversationId,
        msg_id: m.msgId,
        status: 'finish',
        hidden: 0,
        created_at,
        type: item.kind,
        content: JSON.stringify({ content: item.text }),
        position,
      });
    });
  }
  return { rows, unmapped };
}

/**
 * Import (incrementally, idempotently) the CLI message history of one conversation.
 * No-op for non-imported conversations (no extra.cli_session_id).
 */
export async function importConversationMessages(conversationId: string): Promise<ImportConversationMessagesResult> {
  const result: ImportConversationMessagesResult = { imported: 0, skipped: 0, unmapped: 0 };
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const db = new BetterSqlite3(join(getDataPath(), BACKEND_DB));
  try {
    db.pragma('busy_timeout = 5000');

    const conv = db.prepare('SELECT extra FROM conversations WHERE id = ?').get(conversationId) as
      | { extra?: string }
      | undefined;
    if (!conv) return result;
    let extra: { cli_session_id?: string; cli_source?: CliSource; cli_updated_at?: number } = {};
    try {
      extra = JSON.parse(conv.extra ?? '{}') as typeof extra;
    } catch {
      /* malformed extra → treat as non-imported */
    }
    const sessionId = extra.cli_session_id;
    const source = extra.cli_source;
    if (!sessionId || !source) return result; // not a CLI-imported conversation

    const liveRows = db
      .prepare(
        "SELECT content, position, created_at FROM messages WHERE conversation_id = ? AND id NOT LIKE 'cli-%' AND type IN ('text','thinking')"
      )
      .all(conversationId) as LiveRow[];
    const liveIndex = buildLiveRowIndex(liveRows);

    const parsed = parseSessionMessages(source, sessionId);
    const { rows, unmapped } = mapRows(conversationId, parsed, liveIndex);
    result.unmapped = unmapped;

    // Sidebar ordering: reflect the CLI session's real last activity (the
    // sidebar sorts by conversations.updated_at, which is the IMPORT time for
    // imported sessions and never moves on terminal-side activity otherwise).
    // Deliberately combined with extra.cli_updated_at: the backfill at import
    // time uses that value, which comes from a DIFFERENT source than message
    // timestamps (Claude: last record of any type; Codex: file mtime). Taking
    // the max keeps the two writers convergent — without it the first open
    // would "shift" the conversation below its backfilled position once.
    const latestCliTs = parsed.reduce<number | undefined>(
      (max, m) => (m.createdAt !== undefined && (max === undefined || m.createdAt > max) ? m.createdAt : max),
      undefined
    );
    const cliUpdatedAt = typeof extra.cli_updated_at === 'number' ? extra.cli_updated_at : undefined;
    const activityTs =
      latestCliTs !== undefined || cliUpdatedAt !== undefined
        ? Math.max(latestCliTs ?? 0, cliUpdatedAt ?? 0)
        : undefined;
    touchConversationActivity(db, conversationId, activityTs, liveRows.length > 0);

    // One-time per-conversation cleanup of rows from the collided positional
    // Codex id scheme (see LEGACY_CODEX_ID). Scoped to this conversation and
    // idempotent: once purged, no rows match the pattern again.
    const legacyIds =
      source === 'codex'
        ? (
            db
              .prepare("SELECT id FROM messages WHERE conversation_id = ? AND id LIKE 'cli-codex-%'")
              .all(conversationId) as { id: string }[]
          )
            .map((r) => r.id)
            .filter((id) => LEGACY_CODEX_ID.test(id))
        : [];
    if (!rows.length && !legacyIds.length) return result;

    const purge = db.prepare('DELETE FROM messages WHERE id = ?');
    const insert = db.prepare(
      'INSERT OR IGNORE INTO messages (id, conversation_id, msg_id, type, content, position, status, hidden, created_at) VALUES (@id, @conversation_id, @msg_id, @type, @content, @position, @status, @hidden, @created_at)'
    );
    const tx = db.transaction((items: MessageRow[]) => {
      for (const id of legacyIds) purge.run(id);
      for (const r of items) {
        const info = insert.run(r);
        if (info.changes > 0) result.imported += 1;
        else result.skipped += 1;
      }
    });
    tx(rows);
    return result;
  } finally {
    db.close();
  }
}
