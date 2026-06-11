/**
 * Unit tests for the CLI-session true-resume feature (fork, ace/):
 * - aioncoreSchema: PRAGMA-based coupled-schema defense
 * - messageImporter: cross-channel dual-factor dedup (content key + time window)
 * - acp_session idempotent UPDATE semantics (the exact SQL sessionResume runs)
 *
 * Uses node:sqlite instead of better-sqlite3: the repo's better-sqlite3 native
 * binding is compiled for Electron's ABI and cannot load under the vitest Node
 * runtime. hasCoupledSchema only needs a `pragma()` surface, which we adapt.
 */

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@process/utils', () => ({ getDataPath: () => '/tmp/ace-test-nonexistent' }));

import {
  ACE_AIONCORE_COUPLED_SCHEMA,
  backfillImportedConversationActivity,
  hasCoupledSchema,
  touchConversationActivity,
} from '@process/ace/aioncoreSchema';
import { buildLiveRowIndex, contentKey, isLiveDuplicate, LEGACY_CODEX_ID } from '@process/ace/messageImporter';

/** Adapt node:sqlite to the better-sqlite3 `pragma()` surface hasCoupledSchema uses. */
function pragmaAdapter(db: DatabaseSync): { pragma: (sql: string) => unknown } {
  return {
    pragma: (sql: string) => db.prepare(`PRAGMA ${sql}`).all(),
  };
}

function makeAcpSessionDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE acp_session (
      conversation_id TEXT PRIMARY KEY,
      agent_backend TEXT NOT NULL,
      agent_source TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      session_status TEXT NOT NULL DEFAULT 'idle'
    )`
  );
  return db;
}

describe('aioncoreSchema.hasCoupledSchema', () => {
  it('accepts a table containing every coupled column', () => {
    const db = makeAcpSessionDb();
    expect(hasCoupledSchema(pragmaAdapter(db), 'acp_session')).toBe(true);
    db.close();
  });

  it('rejects a missing table (degrade to fresh-continue, no throw)', () => {
    const db = new DatabaseSync(':memory:');
    expect(hasCoupledSchema(pragmaAdapter(db), 'acp_session')).toBe(false);
    db.close();
  });

  it('rejects a table missing a coupled column (simulated aioncore upgrade)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE acp_session (conversation_id TEXT, session_status TEXT)'); // no session_id
    expect(hasCoupledSchema(pragmaAdapter(db), 'acp_session')).toBe(false);
    db.close();
  });

  it('lists messages columns the lazy importer depends on', () => {
    expect(ACE_AIONCORE_COUPLED_SCHEMA.messages).toContain('created_at');
    expect(ACE_AIONCORE_COUPLED_SCHEMA.messages).toContain('position');
  });
});

describe('messageImporter cross-channel dedup', () => {
  const t0 = 1_780_000_000_000;

  it('normalizes CRLF / NBSP / whitespace runs into one content key', () => {
    const a = contentKey('right', 'hello  world\r\nfoo');
    const b = contentKey('right', 'hello world\nfoo');
    const c = contentKey('right', 'hello world foo');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(contentKey('left', 'hello world foo')).not.toBe(a); // position is part of the key
  });

  it('skips a jsonl record only when content matches AND timestamps are within the window', () => {
    const index = buildLiveRowIndex([
      { content: JSON.stringify({ content: '继续' }), position: 'right', created_at: t0 },
    ]);
    expect(isLiveDuplicate(index, 'right', '继续', t0 + 60_000)).toBe(true); // same turn, 1 min apart
    expect(isLiveDuplicate(index, 'right', '继续', t0 + 11 * 60_000)).toBe(false); // verbatim repeat, outside window
    expect(isLiveDuplicate(index, 'left', '继续', t0 + 60_000)).toBe(false); // different position
    expect(isLiveDuplicate(index, 'right', '继续吧', t0 + 60_000)).toBe(false); // different content
  });

  it('keeps records without a timestamp (cannot window-match)', () => {
    const index = buildLiveRowIndex([{ content: JSON.stringify({ content: 'x' }), position: 'right', created_at: t0 }]);
    expect(isLiveDuplicate(index, 'right', 'x', undefined)).toBe(false);
  });

  it('ignores live rows whose content is not the JSON {content} shape', () => {
    const index = buildLiveRowIndex([{ content: 'not-json', position: 'right', created_at: t0 }]);
    expect(isLiveDuplicate(index, 'right', 'not-json', t0)).toBe(false);
  });
});

describe('sidebar activity ordering (touch + backfill)', () => {
  const IMPORT_TS = 1_781_000_000_000;
  const CLI_TS = 1_750_000_000_000; // older than import time → requires rewind

  function makeListDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, extra TEXT);
             CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, msg_id TEXT, type TEXT,
               content TEXT, position TEXT, status TEXT, hidden INTEGER, created_at INTEGER)`);
    const adapted = {
      pragma: (sql: string) => db.prepare(`PRAGMA ${sql}`).all(),
      prepare: db.prepare.bind(db),
    };
    return { db, adapted };
  }

  function updatedAt(db: DatabaseSync, id: string): number {
    return (db.prepare('SELECT updated_at u FROM conversations WHERE id=?').get(id) as { u: number }).u;
  }

  it('backfill rewinds imported conversations without in-app turns, skips others, idempotent', () => {
    const { db, adapted } = makeListDb();
    const extra = JSON.stringify({ cli_session_id: 's1', cli_updated_at: CLI_TS });
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('imported', IMPORT_TS, extra);
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('chatted', IMPORT_TS, extra);
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('normal', IMPORT_TS, JSON.stringify({}));
    // 'chatted' has an in-app (live) turn → must NOT be rewound
    db.prepare("INSERT INTO messages (id, conversation_id) VALUES ('live-1','chatted')").run();
    // a cli- synced row must NOT count as in-app activity
    db.prepare("INSERT INTO messages (id, conversation_id) VALUES ('cli-x-0','imported')").run();

    expect(backfillImportedConversationActivity(adapted)).toBe(1);
    expect(updatedAt(db, 'imported')).toBe(CLI_TS); // rewound to real activity
    expect(updatedAt(db, 'chatted')).toBe(IMPORT_TS); // in-app turn wins
    expect(updatedAt(db, 'normal')).toBe(IMPORT_TS); // not imported → untouched
    expect(backfillImportedConversationActivity(adapted)).toBe(0); // idempotent
    db.close();
  });

  it('touch: forward-only with live rows, exact set (rewind) without', () => {
    const { db, adapted } = makeListDb();
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('c1', IMPORT_TS, '{}');

    touchConversationActivity(adapted, 'c1', CLI_TS, true); // live rows → no rewind
    expect(updatedAt(db, 'c1')).toBe(IMPORT_TS);
    touchConversationActivity(adapted, 'c1', IMPORT_TS + 5000, true); // forward bump ok
    expect(updatedAt(db, 'c1')).toBe(IMPORT_TS + 5000);
    touchConversationActivity(adapted, 'c1', CLI_TS, false); // no live rows → rewind allowed
    expect(updatedAt(db, 'c1')).toBe(CLI_TS);
    touchConversationActivity(adapted, 'c1', undefined, false); // no timestamp → no-op
    touchConversationActivity(adapted, 'c1', -1, false); // invalid → no-op
    expect(updatedAt(db, 'c1')).toBe(CLI_TS);
    db.close();
  });

  it('backfill handles cli_updated_at stored as a JSON string (CAST coercion)', () => {
    const { db, adapted } = makeListDb();
    const extra = JSON.stringify({ cli_session_id: 's1', cli_updated_at: String(CLI_TS) });
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('imported', IMPORT_TS, extra);
    expect(backfillImportedConversationActivity(adapted)).toBe(1);
    expect(updatedAt(db, 'imported')).toBe(CLI_TS);
    db.close();
  });

  it('backfill then exact-touch converge when fed the same combined timestamp', () => {
    const { db, adapted } = makeListDb();
    const extra = JSON.stringify({ cli_session_id: 's1', cli_updated_at: CLI_TS });
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('imported', IMPORT_TS, extra);
    backfillImportedConversationActivity(adapted);
    // The importer touches with max(latestMessageTs, cli_updated_at); when the
    // last message is OLDER than cli_updated_at, the position must not shift.
    const combined = Math.max(CLI_TS - 60_000, CLI_TS);
    touchConversationActivity(adapted, 'imported', combined, false);
    expect(updatedAt(db, 'imported')).toBe(CLI_TS); // no first-open shift
    // A genuinely newer terminal-side message moves it forward.
    touchConversationActivity(adapted, 'imported', CLI_TS + 60_000, false);
    expect(updatedAt(db, 'imported')).toBe(CLI_TS + 60_000);
    db.close();
  });

  it('touch stores INTEGER even when fed a float timestamp (mtimeMs regression)', () => {
    // A REAL in the INTEGER updated_at column breaks aioncore's i64 row
    // deserialization and 500s the whole conversation list endpoint.
    const { db, adapted } = makeListDb();
    db.prepare('INSERT INTO conversations VALUES (?,?,?)').run('c1', IMPORT_TS, '{}');
    touchConversationActivity(adapted, 'c1', 1_781_157_889_709.2073, false);
    const row = db.prepare("SELECT updated_at u, typeof(updated_at) t FROM conversations WHERE id='c1'").get() as {
      u: number;
      t: string;
    };
    expect(row.t).toBe('integer');
    expect(row.u).toBe(1_781_157_889_709);
    db.close();
  });

  it('helpers degrade to no-op when the conversations table is missing', () => {
    const db = new DatabaseSync(':memory:');
    const adapted = { pragma: (sql: string) => db.prepare(`PRAGMA ${sql}`).all(), prepare: db.prepare.bind(db) };
    expect(backfillImportedConversationActivity(adapted)).toBe(0);
    expect(() => touchConversationActivity(adapted, 'c1', 123, false)).not.toThrow();
    db.close();
  });
});

describe('LEGACY_CODEX_ID (collided positional scheme detection)', () => {
  it('matches only the old global-colliding positional ids', () => {
    expect(LEGACY_CODEX_ID.test('cli-codex-0-0')).toBe(true);
    expect(LEGACY_CODEX_ID.test('cli-codex-127-1')).toBe(true);
  });

  it('never matches the fixed session-scoped scheme or claude uuid ids', () => {
    expect(LEGACY_CODEX_ID.test('cli-codex-019e6efc-9309-7442-913c-13ee26f64f4e-0-0')).toBe(false);
    expect(LEGACY_CODEX_ID.test('cli-553ae089-8ca9-4dea-941e-d37a4e0a793b-0')).toBe(false);
  });
});

describe('acp_session idempotent session_id UPDATE (sessionResume SQL)', () => {
  // node:sqlite uses positional/named params like better-sqlite3's @name form via $/: prefixes;
  // keep the exact predicate shape sessionResume runs.
  const UPDATE_SQL =
    'UPDATE acp_session SET session_id = :sid WHERE conversation_id = :cid AND (session_id IS NULL OR session_id <> :sid)';

  it('sets session_id when NULL, is a no-op when already equal, overwrites when different', () => {
    const db = makeAcpSessionDb();
    db.prepare(
      "INSERT INTO acp_session (conversation_id, agent_backend, agent_source, agent_id, session_id) VALUES ('c1','claude','builtin','a1',NULL)"
    ).run();
    const update = db.prepare(UPDATE_SQL);

    expect(update.run({ sid: 'uuid-1', cid: 'c1' }).changes).toBe(1); // NULL → set
    expect(update.run({ sid: 'uuid-1', cid: 'c1' }).changes).toBe(0); // idempotent re-run
    expect(update.run({ sid: 'uuid-2', cid: 'c1' }).changes).toBe(1); // cleared/changed by aioncore → re-point

    const row = db.prepare("SELECT session_id FROM acp_session WHERE conversation_id='c1'").get() as {
      session_id: string;
    };
    expect(row.session_id).toBe('uuid-2');
    db.close();
  });
});
