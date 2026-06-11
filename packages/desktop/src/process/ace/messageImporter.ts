/**
 * Lazily import a CLI conversation's message history into the aioncore sqlite DB.
 *
 * Verified by probe: directly writing the `messages` table of aionui-backend.db is
 * read back immediately by aioncore over HTTP (it does not cache messages).
 *
 * Sync model is REPLACE-SYNC: on every open, this conversation's `cli-` rows are
 * purged and rebuilt from the jsonl (skipped entirely when the jsonl is gone, so
 * already-imported history survives file deletion). This self-heals id-scheme and
 * noise-filter changes — positional Codex ids shift whenever a harness-injected
 * record is filtered out — and removes noise rows written by older versions.
 * Live rows (written by aioncore, non `cli-` ids) are never touched.
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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { getDataPath } from '@process/utils';
import type { CliSource, ImportConversationMessagesResult, ParsedCliItem, ParsedCliMessage } from '@/common/ace/types';
import { touchConversationActivity } from './aioncoreSchema';
import { findSessionFiles, parseSessionFiles } from './messageParser';

const BACKEND_DB = 'aionui-backend.db';
const DEDUP_WINDOW_MS = 10 * 60_000;

// --- inline image materialization -------------------------------------------
// Both CLIs embed attached images as base64 inside the session file. The app's
// existing render path (MessageText → [[AION_FILES]] marker → FilePreview →
// Arco Image preview) needs a real file on disk, so images are decoded into an
// app-owned cache, content-addressed for idempotency across replace-syncs.

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/** Cache dir for one CLI session's materialized images (deleted with the conversation). */
export function cliImageCacheDir(sessionId: string): string {
  return join(getDataPath(), 'ace-cli-images', sessionId);
}

/** Decode inline images to cache files; returns absolute paths (best-effort). */
export function materializeCliImages(sessionId: string, images: { mediaType: string; dataBase64: string }[]): string[] {
  const out: string[] = [];
  // sessionId lands in a path segment; it comes from DB extra, so refuse
  // anything that is not a plain id token (no separators / traversal).
  if (!images.length || !/^[\w.-]+$/.test(sessionId)) return out;
  const dir = cliImageCacheDir(sessionId);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return out;
  }
  for (const img of images) {
    try {
      const buf = Buffer.from(img.dataBase64, 'base64');
      if (!buf.length) continue;
      const name = `${createHash('sha1').update(buf).digest('hex')}.${IMAGE_EXT[img.mediaType] ?? 'png'}`;
      const p = join(dir, name);
      if (!existsSync(p)) writeFileSync(p, buf);
      out.push(p);
    } catch {
      /* skip one undecodable image, keep the rest */
    }
  }
  return out;
}

/** Append file paths in the app's [[AION_FILES]] message format (FilePreview renders them). */
export function withFilesMarker(text: string, paths: string[]): string {
  if (!paths.length) return text;
  return `${text ? `${text}\n` : ''}${AIONUI_FILES_MARKER}\n${paths.join('\n')}`;
}

/**
 * A literal [[AION_FILES]] inside CLI chat text (e.g. a conversation ABOUT this
 * app) would make MessageText treat everything after it as attachment paths and
 * render garbage file cards. Break the token with a zero-width space —
 * visually identical, no longer matches the marker scan.
 */
export function escapeFilesMarker(text: string): string {
  return text.split(AIONUI_FILES_MARKER).join('[[AION_FILES\u200b]]');
}

type ToolItem = Extract<ParsedCliItem, { kind: 'tool' }>;

/**
 * Content payload for an imported tool row — byte-compatible with what aioncore
 * persists for live turns (type 'acp_tool_call', ACP tool_call_update shape),
 * so MessageAcpToolCall / tool grouping render it with zero new UI code.
 */
export function toolCallContent(source: CliSource, sessionId: string, t: ToolItem): Record<string, unknown> {
  return {
    ...(source === 'claude-code' ? { _meta: { claudeCode: { toolName: t.name } } } : {}),
    session_id: sessionId,
    update: {
      tool_call_id: t.callId,
      session_update: 'tool_call_update',
      status: t.status,
      title: t.title,
      kind: t.toolKind,
      ...(t.rawInput !== undefined ? { raw_input: t.rawInput } : {}),
      ...(t.output
        ? { raw_output: t.output, content: [{ type: 'content', content: { type: 'text', text: t.output } }] }
        : { content: [] }),
    },
  };
}

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
  sessionId: string,
  source: CliSource,
  messages: ParsedCliMessage[],
  liveIndex: LiveRowIndex,
  liveToolIds: Set<string>
): { rows: MessageRow[]; unmapped: number } {
  const rows: MessageRow[] = [];
  let unmapped = 0;
  for (const m of messages) {
    const imagePaths = materializeCliImages(
      sessionId,
      m.items.flatMap((it) => (it.kind === 'image' ? [it] : []))
    );
    // The turn's images ride on its first text row; image-only turns get a
    // synthesized attachment row below.
    let pendingImages = imagePaths;
    m.items.forEach((item, i) => {
      const created_at = m.createdAt ?? Date.now();
      if (item.kind === 'image') return; // materialized above
      if (item.kind === 'compact-summary') {
        // Rendered by MessageThinking's ace variant: a one-line "session
        // compacted" header, collapsed by default, markdown body on expand.
        rows.push({
          id: `cli-${m.msgId}-${i}`,
          conversation_id: conversationId,
          msg_id: m.msgId,
          status: 'finish',
          hidden: 0,
          created_at,
          type: 'thinking',
          content: JSON.stringify({ content: item.text, status: 'done', aceCompactSummary: true }),
          position: 'left',
        });
        return;
      }
      if (item.kind === 'tool') {
        // aioncore persisted this call already for an in-app turn (live row) —
        // tool_call_id is globally unique, so this dedup is exact.
        if (liveToolIds.has(item.callId)) return;
        rows.push({
          id: `cli-${m.msgId}-${i}`,
          conversation_id: conversationId,
          msg_id: item.callId,
          status: 'finish',
          hidden: 0,
          created_at,
          type: 'acp_tool_call',
          content: JSON.stringify(toolCallContent(source, sessionId, item)),
          position: 'left',
        });
        return;
      }
      if (item.kind === 'tip') {
        // CLI notice (gemini error/info/warning) → the app's native tips row;
        // MessageTips handles all three types with zero new UI.
        rows.push({
          id: `cli-${m.msgId}-${i}`,
          conversation_id: conversationId,
          msg_id: m.msgId,
          status: 'finish',
          hidden: 0,
          created_at,
          type: 'tips',
          content: JSON.stringify({ content: item.text, type: item.tipType }),
          position: 'left',
        });
        return;
      }
      if (item.kind !== 'text' && item.kind !== 'thinking') {
        unmapped += 1;
        return;
      }
      const position = item.kind === 'text' && m.role === 'user' ? 'right' : 'left';
      // Dedup probes the RAW m.createdAt (not the Date.now() fallback above) so
      // records without a CLI timestamp are conservatively kept, never dropped.
      if (isLiveDuplicate(liveIndex, position, item.text, m.createdAt)) return; // already written live by aioncore
      // Only text rows go through MessageText's [[AION_FILES]] scan.
      let text = item.kind === 'text' ? escapeFilesMarker(item.text) : item.text;
      if (pendingImages.length && item.kind === 'text') {
        text = withFilesMarker(text, pendingImages);
        pendingImages = [];
      }
      rows.push({
        id: `cli-${m.msgId}-${i}`,
        conversation_id: conversationId,
        msg_id: m.msgId,
        status: 'finish',
        hidden: 0,
        created_at,
        type: item.kind,
        // status 'done' keeps MessageThinking from showing a live spinner/timer
        // for imported thinking rows; harmless extra field for text rows.
        content: JSON.stringify(item.kind === 'thinking' ? { content: text, status: 'done' } : { content: text }),
        position,
      });
    });
    if (pendingImages.length) {
      rows.push({
        id: `cli-${m.msgId}-img`,
        conversation_id: conversationId,
        msg_id: m.msgId,
        status: 'finish',
        hidden: 0,
        created_at: m.createdAt ?? Date.now(),
        type: 'text',
        content: JSON.stringify({ content: withFilesMarker('', pendingImages) }),
        position: m.role === 'user' ? 'right' : 'left',
      });
    }
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
    const liveToolIds = new Set(
      (
        db
          .prepare(
            "SELECT msg_id FROM messages WHERE conversation_id = ? AND id NOT LIKE 'cli-%' AND type = 'acp_tool_call'"
          )
          .all(conversationId) as { msg_id: string }[]
      ).map((r) => r.msg_id)
    );

    // Files gone → keep whatever was already imported (replace-sync would wipe it).
    const files = findSessionFiles(source, sessionId);
    if (!files.length) return result;
    const parsed = parseSessionFiles(source, files, sessionId);
    const { rows, unmapped } = mapRows(conversationId, sessionId, source, parsed, liveIndex, liveToolIds);
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

    // Replace-sync (scoped to this conversation, cli- rows only) — see header.
    const purge = db.prepare("DELETE FROM messages WHERE conversation_id = ? AND id LIKE 'cli-%'");
    const insert = db.prepare(
      'INSERT OR IGNORE INTO messages (id, conversation_id, msg_id, type, content, position, status, hidden, created_at) VALUES (@id, @conversation_id, @msg_id, @type, @content, @position, @status, @hidden, @created_at)'
    );
    const tx = db.transaction((items: MessageRow[]) => {
      purge.run(conversationId);
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
