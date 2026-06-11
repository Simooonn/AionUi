/**
 * Parse opencode local sessions into AionUi conversation metadata + messages.
 *
 * Storage is NOT per-session files: opencode keeps everything in ONE shared
 * SQLite database (drizzle, WAL) at <XDG_DATA_HOME|~/.local/share>/opencode/
 * opencode.db. `session` rows carry directory/title/time_* as plain columns;
 * `message.data` / `part.data` are JSON blobs. Verified part-type census on
 * real data: text / tool / reasoning / file (base64 data-URL image) /
 * step-start / step-finish / patch — the last three are structural records
 * and are skipped.
 *
 * Access discipline (see plan opencode-cli-adapter.md, Principle 4):
 * ALL access here is READ-ONLY. The single write channel into opencode.db is
 * sessionFiles.deleteOpencodeSessionRows (controlled delete, FK-cascade).
 *
 * Driver loading: the find/parse entry points are called from messageParser's
 * SYNC dispatch (findSessionFiles/parseSessionFiles), so better-sqlite3 is
 * loaded synchronously via createRequire — lazily, so importing this module's
 * pure mapping functions under vitest never touches the native module (its ABI
 * does not load under vitest; tests feed plain row objects instead).
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliSessionMeta, ParsedCliItem, ParsedCliMessage } from '@/common/ace/types';
import { boundedRawInput, capText, imageFromDataUrl, toolTitle } from './parseHelpers';

type Db = import('better-sqlite3').Database;
type DbCtor = new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }) => Db;

/** The shared opencode database — the "session file" of every opencode session. */
export function opencodeDbPath(): string {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(dataHome, 'opencode', 'opencode.db');
}

let driver: DbCtor | null | undefined;
function loadDriver(): DbCtor | null {
  if (driver !== undefined) return driver;
  try {
    driver = createRequire(__filename)('better-sqlite3') as DbCtor;
  } catch {
    driver = null;
  }
  return driver;
}

/** Read-only handle on opencode.db, or null when the DB does not exist. */
function openOpencodeDb(): Db | null {
  const path = opencodeDbPath();
  if (!existsSync(path)) return null;
  const Ctor = loadDriver();
  // DB present but driver unavailable would silently import nothing — fail loud.
  if (!Ctor) throw new Error('opencode session scan unavailable: sqlite driver failed to load');
  const db = new Ctor(path, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 5000');
  return db;
}

// --- session scanner ----------------------------------------------------------

export type OpencodeSessionRow = {
  id: string;
  directory: string | null;
  title: string | null;
  time_created: number | null;
  time_updated: number | null;
};

const SESSION_COLUMNS = ['id', 'directory', 'title', 'time_created', 'time_updated'] as const;

/**
 * opencode titles sometimes carry a markdown wrapper (observed on real data:
 * `# Conversation Title: "..."`). Strip it; the inner text is the real title.
 */
export function cleanOpencodeTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let t = raw.trim();
  const m = /^#+\s*Conversation Title:\s*(.*)$/i.exec(t);
  if (m) t = m[1].trim();
  t = t
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/^\*\*([\s\S]*)\*\*$/, '$1')
    .replace(/^#+\s*/, '')
    .trim();
  return t;
}

/** Pure row → meta mapping (unit-tested with plain objects, no sqlite). */
export function mapOpencodeSessionRow(row: OpencodeSessionRow): CliSessionMeta {
  const title = cleanOpencodeTitle(row.title);
  return {
    source: 'opencode',
    sessionId: row.id,
    backend: 'opencode',
    title: title || row.id,
    workspace: typeof row.directory === 'string' && row.directory ? row.directory : undefined,
    // INTEGER columns upstream must never receive a REAL (see ACE_CHANGES
    // float-binding incident) — round at the source like the other scanners.
    createdAt: typeof row.time_created === 'number' ? Math.round(row.time_created) : undefined,
    updatedAt: typeof row.time_updated === 'number' ? Math.round(row.time_updated) : undefined,
  };
}

/**
 * Scan ALL opencode sessions (per spec: child sub-agent sessions, global-project
 * sessions and empty sessions are imported too — no exclusion).
 * Throws (fail-loud) on schema mismatch: a silent empty result would read as
 * "nothing to import" and mask an opencode format change.
 */
export function parseOpencodeSessions(): CliSessionMeta[] {
  const db = openOpencodeDb();
  if (!db) return []; // machine without opencode
  try {
    const cols = new Set((db.prepare('PRAGMA table_info(session)').all() as { name: string }[]).map((c) => c.name));
    const missing = SESSION_COLUMNS.filter((c) => !cols.has(c));
    if (missing.length) {
      throw new Error(`opencode schema mismatch (session table lacks: ${missing.join(', ')}) — import aborted`);
    }
    const rows = db
      .prepare('SELECT id, directory, title, time_created, time_updated FROM session')
      .all() as OpencodeSessionRow[];
    return rows.map(mapOpencodeSessionRow);
  } finally {
    db.close();
  }
}

// --- locator (the "session file" of an opencode session is the shared DB) -----

/**
 * Existence gate: returns [opencode.db] iff the session ROW still exists —
 * mirroring "the session file is still on disk" for the file-based CLIs, so
 * messageImporter's replace-sync keep-imported semantics and sessionResume's
 * existence check work unchanged.
 *
 * ⚠️ The returned path is the SHARED DATABASE, not a per-session file. It must
 * NEVER flow into the file-deletion channel — resolveSessionFilePath's opencode
 * branch deliberately produces a { kind: 'opencode' } descriptor instead of a
 * path, and the unlink whitelist does not include the opencode data dir
 * (defense in depth; see the 🔴 regression tests).
 */
export function findOpencodeFiles(sessionId: string): string[] {
  let db: Db | null = null;
  try {
    db = openOpencodeDb();
    if (!db) return [];
    const row = db.prepare('SELECT 1 AS one FROM session WHERE id = ?').get(sessionId);
    return row ? [opencodeDbPath()] : [];
  } catch {
    // Display path degrades soft: "can't read" → keep already-imported rows.
    return [];
  } finally {
    db?.close();
  }
}

// --- message parser ------------------------------------------------------------

export type OpencodeMessageRow = { id: string; time_created: number | null; data: string };
export type OpencodePartRow = { id: string; message_id: string; data: string };

// opencode marks its own injected text parts with synthetic:true; additionally
// the harness injects rule walls as plain user text (same word family as the
// Claude side). Like the codex/gemini precedent this gate applies to USER
// records only — assistants may legitimately quote these markers.
const OPENCODE_NOISE_PREFIXES = ['[Assistant Rules]'];

/** True for opencode user text injected by the harness (not typed by the user). */
export function isOpencodeInjectedText(text: string): boolean {
  const trimmed = text.trim();
  return OPENCODE_NOISE_PREFIXES.some((p) => trimmed.startsWith(p));
}

type OpencodePartData = {
  type?: string;
  text?: unknown;
  synthetic?: unknown;
  // tool parts
  tool?: unknown;
  callID?: unknown;
  state?: { status?: unknown; input?: unknown; output?: unknown; title?: unknown };
  // file parts
  mime?: unknown;
  url?: unknown;
};

/** ACP tool-call kind for an opencode tool name (drives the row icon). */
function opencodeToolKind(name: string): string {
  if (name === 'read' || name === 'list') return 'read';
  if (name === 'write' || name === 'edit' || name === 'patch') return 'edit';
  if (name === 'bash') return 'execute';
  if (name === 'grep' || name === 'glob') return 'search';
  if (name === 'webfetch' || name === 'websearch') return 'fetch';
  if (name === 'task') return 'think';
  return 'other';
}

function itemFromOpencodePart(data: OpencodePartData, role: 'user' | 'assistant'): ParsedCliItem | null {
  if (data.type === 'text') {
    if (data.synthetic === true || data.synthetic === 1) return null; // opencode's own injection marker
    const t = typeof data.text === 'string' && data.text.trim() ? data.text : null;
    if (!t || (role === 'user' && isOpencodeInjectedText(t))) return null;
    return { kind: 'text', text: t };
  }
  if (data.type === 'reasoning') {
    const t = typeof data.text === 'string' && data.text.trim() ? data.text : null;
    return t ? { kind: 'thinking', text: t } : null;
  }
  if (data.type === 'tool' && typeof data.tool === 'string' && typeof data.callID === 'string') {
    const state = data.state ?? {};
    const output = typeof state.output === 'string' && state.output.trim() ? capText(state.output) : undefined;
    return {
      kind: 'tool',
      callId: data.callID,
      name: data.tool,
      title: typeof state.title === 'string' && state.title.trim() ? state.title : toolTitle(data.tool, state.input),
      toolKind: opencodeToolKind(data.tool),
      status: state.status === 'error' ? 'failed' : 'completed',
      rawInput: boundedRawInput(state.input),
      ...(output ? { output } : {}),
    };
  }
  if (data.type === 'file') {
    const img = typeof data.mime === 'string' && data.mime.startsWith('image/') ? imageFromDataUrl(data.url) : null;
    return img ? { kind: 'image', ...img } : null;
  }
  // step-start / step-finish / patch / snapshot / unknown → structural, skipped.
  return null;
}

/** Pure rows → messages mapping (unit-tested with plain objects, no sqlite). */
export function mapOpencodeMessages(
  messageRows: OpencodeMessageRow[],
  partRows: OpencodePartRow[]
): ParsedCliMessage[] {
  const partsByMessage = new Map<string, OpencodePartRow[]>();
  for (const p of partRows) {
    const list = partsByMessage.get(p.message_id);
    if (list) list.push(p);
    else partsByMessage.set(p.message_id, [p]);
  }
  const out: ParsedCliMessage[] = [];
  for (const m of messageRows) {
    let role: 'user' | 'assistant';
    try {
      const data = JSON.parse(m.data) as { role?: unknown };
      if (data.role !== 'user' && data.role !== 'assistant') continue;
      role = data.role;
    } catch {
      continue;
    }
    const items: ParsedCliItem[] = [];
    for (const p of partsByMessage.get(m.id) ?? []) {
      let parsed: OpencodePartData;
      try {
        parsed = JSON.parse(p.data) as OpencodePartData;
      } catch {
        continue;
      }
      const item = itemFromOpencodePart(parsed, role);
      if (item) items.push(item);
    }
    if (!items.length) continue;
    out.push({
      // message.id ('msg_…') is globally unique — no positional-id collision
      // (see the codex global-primary-key incident in ACE_CHANGES).
      msgId: `opencode-${m.id}`,
      role,
      createdAt: typeof m.time_created === 'number' ? Math.round(m.time_created) : undefined,
      items,
    });
  }
  return out;
}

/** Parse one opencode session's full history from the shared DB (read-only). */
export function parseOpencodeMessages(sessionId: string): ParsedCliMessage[] {
  let db: Db | null = null;
  try {
    db = openOpencodeDb();
    if (!db) return [];
    const messageRows = db
      .prepare('SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id')
      .all(sessionId) as OpencodeMessageRow[];
    const partRows = db
      .prepare('SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY message_id, id')
      .all(sessionId) as OpencodePartRow[];
    return mapOpencodeMessages(messageRows, partRows);
  } catch {
    return []; // display path degrades soft (keep-imported semantics upstream)
  } finally {
    db?.close();
  }
}
