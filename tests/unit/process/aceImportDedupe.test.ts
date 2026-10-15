/**
 * Unit tests for the CLI-import dedupe hardening (fork, ace/):
 * - aioncoreSchema: import-specific schema gates + baseline / loser SQL helpers
 * - importCliSessions: read-only DB baseline (archived rows included), empty-baseline
 *   tripwire, reason-carrying aborts, protected duplicate cleanup
 * - useImportCliSessions: pure renderer helpers (scan action, summary, release)
 *
 * Uses node:sqlite instead of better-sqlite3 (the native binding targets Electron's
 * ABI); the orchestration tests mock `better-sqlite3` with a thin adapter over
 * node:sqlite that mirrors the `{ readonly, fileMustExist }` open options.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliSessionMeta, CliSource } from '@/common/ace/types';

// Hoisted so the vi.mock factories below can reference it (they are hoisted above imports).
const h = await vi.hoisted(async () => {
  const { DatabaseSync: Db } = await import('node:sqlite');
  const { existsSync: exists } = await import('node:fs');
  const { vi: v } = await import('vitest');
  /** better-sqlite3 stand-in over node:sqlite, honouring { readonly, fileMustExist }. */
  class Adapter {
    private readonly db: InstanceType<typeof Db>;
    constructor(path: string, opts?: { readonly?: boolean; fileMustExist?: boolean }) {
      if (opts?.fileMustExist && !exists(path)) throw new Error(`SQLITE_CANTOPEN: unable to open ${path}`);
      this.db = new Db(path, { readOnly: Boolean(opts?.readonly) });
    }
    pragma(sql: string) {
      return this.db.prepare(`PRAGMA ${sql}`).all();
    }
    prepare(sql: string) {
      return this.db.prepare(sql);
    }
    close() {
      this.db.close();
    }
  }
  const call = () => ({ invoke: v.fn() });
  return {
    dataDir: `${(process.env.TMPDIR || '/tmp').replace(/\/$/, '')}/ace-import-dedupe-${process.pid}-${Date.now()}`,
    sessions: { claude: [] as unknown[], codex: [] as unknown[], gemini: [] as unknown[], opencode: [] as unknown[] },
    Adapter,
    ipcBridge: {
      conversation: { create: call(), remove: call() },
      database: { getUserConversations: call() },
      sidebar: {
        get: call(),
        items: call(),
        removeProject: call(),
        archive: call(),
        unarchive: call(),
        deleteArchived: call(),
        deleteArchivedItem: call(),
        archiveProject: call(),
        unarchiveProject: call(),
        deleteArchivedProject: call(),
      },
    },
  };
});

vi.mock('@process/utils', () => ({ getDataPath: () => h.dataDir }));
vi.mock('@/common', () => ({ ipcBridge: h.ipcBridge }));
// Parsers are mocked to isolate the developer's real ~/.claude, ~/.codex, ~/.gemini and opencode.db.
vi.mock('@process/ace/parsers/claudeParser', () => ({ parseClaudeCodeSessions: () => h.sessions.claude }));
vi.mock('@process/ace/parsers/codexParser', () => ({ parseCodexSessions: () => h.sessions.codex }));
vi.mock('@process/ace/parsers/geminiParser', () => ({ parseGeminiSessions: () => h.sessions.gemini }));
vi.mock('@process/ace/parsers/opencodeParser', () => ({ parseOpencodeSessions: () => h.sessions.opencode }));
vi.mock('better-sqlite3', () => ({ default: h.Adapter }));
// AC7 guard: the two local-file deletion channels are automocked; every export must stay at 0 calls.
vi.mock('@process/ace/sessionFiles');
vi.mock('@/renderer/ace/deleteWithLocalFiles');

import type { TFunction } from 'i18next';
import {
  ACE_AIONCORE_COUPLED_SCHEMA,
  ACE_IMPORT_BASELINE_SCHEMA,
  ACE_IMPORT_DEDUPE_SCHEMA,
  findDuplicateImportLosers,
  hasCoupledSchema,
  hasImportSchema,
  readAcpSessionIds,
  readImportedCliSessionIds,
} from '@process/ace/aioncoreSchema';
import { hasOpenTerminalIn, importCliSessions, scanCliSessions } from '@process/ace/importCliSessions';
import * as sessionFiles from '@process/ace/sessionFiles';
import * as deleteWithLocalFiles from '@/renderer/ace/deleteWithLocalFiles';
import { TerminalManager } from '@/process/terminal/TerminalManager';
import {
  buildImportSummary,
  releaseRemovedConversations,
  resolveScanAction,
} from '@/renderer/ace/settings/useImportCliSessions';
import { createSpawnSpy } from '../terminal/_fakePty';

/** No embedded terminal is open (the renderer terminal UI is currently removed). */
const NO_TERMINAL = { hasOpenTerminal: () => false };

/** AC7: neither local-file deletion channel may be touched by the import/cleanup path. */
function expectNoLocalFileChannelTouched(): void {
  for (const mod of [sessionFiles, deleteWithLocalFiles]) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'function') expect(value, `${name} must not be called`).not.toHaveBeenCalled();
    }
  }
}

/** Every sidebar endpoint except `allowed` must stay untouched (no bulk / project / archive-state calls). */
function expectSidebarUntouchedExcept(...allowed: string[]): void {
  for (const [name, api] of Object.entries(h.ipcBridge.sidebar)) {
    if (allowed.includes(name)) continue;
    expect(api.invoke, `sidebar.${name} must not be called`).not.toHaveBeenCalled();
  }
}

const DB_FILE = () => join(h.dataDir, 'aionui-backend.db');
const createInvoke = () => h.ipcBridge.conversation.create.invoke as ReturnType<typeof vi.fn>;
const listInvoke = () => h.ipcBridge.database.getUserConversations.invoke as ReturnType<typeof vi.fn>;

const FULL_DDL = `CREATE TABLE conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'u1', extra TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, archived_at INTEGER);
  CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL);
  CREATE TABLE cron_jobs (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL);
  CREATE TABLE acp_session (conversation_id TEXT PRIMARY KEY, session_id TEXT)`;

type SeedRow = { id: string; extra: unknown; user?: string; created?: number; archived?: number | null };

/** (Re)create the on-disk backend DB the import reads; returns nothing, file is closed. */
function seedBackendDb(rows: SeedRow[], ddl: string = FULL_DDL): void {
  mkdirSync(h.dataDir, { recursive: true });
  rmSync(DB_FILE(), { force: true });
  const db = new DatabaseSync(DB_FILE());
  db.exec(ddl);
  for (const r of rows) insertConversation(db, r.id, r.extra, r);
  db.close();
}

/** Extra on-disk rows (messages / cron_jobs / acp_session pointers) for the cleanup fixtures. */
function seedRelated(opts: {
  liveMessageFor?: string[];
  cliMessageFor?: string[];
  cronFor?: string[];
  acp?: Array<[conversationId: string, sessionId: string | null]>;
}): void {
  const db = new DatabaseSync(DB_FILE());
  for (const id of opts.liveMessageFor ?? []) db.prepare('INSERT INTO messages VALUES (?, ?)').run(`live-${id}`, id);
  for (const id of opts.cliMessageFor ?? []) db.prepare('INSERT INTO messages VALUES (?, ?)').run(`cli-${id}-1`, id);
  for (const id of opts.cronFor ?? []) db.prepare('INSERT INTO cron_jobs VALUES (?, ?)').run(`job-${id}`, id);
  for (const [cid, sid] of opts.acp ?? []) db.prepare('INSERT INTO acp_session VALUES (?, ?)').run(cid, sid);
  db.close();
}

const meta = (source: CliSource, sessionId: string): CliSessionMeta => ({
  source,
  sessionId,
  backend: source === 'claude-code' ? 'claude' : source,
  title: `title ${sessionId}`,
  workspace: '/nonexistent/workspace',
  createdAt: 1,
  updatedAt: 2,
});

function setSessions(list: CliSessionMeta[]): void {
  h.sessions.claude = list.filter((m) => m.source === 'claude-code');
  h.sessions.codex = list.filter((m) => m.source === 'codex');
  h.sessions.gemini = list.filter((m) => m.source === 'gemini');
  h.sessions.opencode = list.filter((m) => m.source === 'opencode');
}

/** Adapt node:sqlite to the better-sqlite3 `pragma()` + `prepare().all()` surface. */
function adapt(db: DatabaseSync) {
  return {
    pragma: (sql: string) => db.prepare(`PRAGMA ${sql}`).all(),
    prepare: (sql: string) => db.prepare(sql),
  };
}

/** Full-shape fixture mirroring the aioncore columns the dedupe SQL touches. */
function makeFullDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(FULL_DDL);
  return db;
}

function insertConversation(
  db: DatabaseSync,
  id: string,
  extra: unknown,
  opts: { user?: string; created?: number; archived?: number | null } = {}
): void {
  db.prepare(
    'INSERT INTO conversations (id, user_id, extra, created_at, updated_at, archived_at) VALUES (?,?,?,?,?,?)'
  ).run(
    id,
    opts.user ?? 'u1',
    typeof extra === 'string' ? extra : JSON.stringify(extra),
    opts.created ?? 0,
    0,
    opts.archived ?? null
  );
}

describe('aioncoreSchema import schema gates', () => {
  it('shared coupled list is untouched (conversations still id/updated_at/extra)', () => {
    expect([...ACE_AIONCORE_COUPLED_SCHEMA.conversations]).toEqual(['id', 'updated_at', 'extra']);
  });

  it('old-style fixture: shared gate true; baseline gate false until acp_session exists; dedupe gate false (no created_at)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, extra TEXT);
             CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT);
             CREATE TABLE cron_jobs (id TEXT PRIMARY KEY, conversation_id TEXT)`);
    const a = adapt(db);
    expect(hasCoupledSchema(a, 'conversations')).toBe(true);
    expect(hasImportSchema(a, ACE_IMPORT_BASELINE_SCHEMA)).toBe(false);
    expect(hasImportSchema(a, ACE_IMPORT_DEDUPE_SCHEMA)).toBe(false);
    db.exec('CREATE TABLE acp_session (conversation_id TEXT, session_id TEXT)');
    expect(hasImportSchema(a, ACE_IMPORT_BASELINE_SCHEMA)).toBe(true);
  });

  it('full fixture: both gates true; dropping cron_jobs only breaks the dedupe gate', () => {
    const db = makeFullDb();
    const a = adapt(db);
    expect(hasImportSchema(a, ACE_IMPORT_BASELINE_SCHEMA)).toBe(true);
    expect(hasImportSchema(a, ACE_IMPORT_DEDUPE_SCHEMA)).toBe(true);
    db.exec('DROP TABLE cron_jobs');
    expect(hasImportSchema(a, ACE_IMPORT_BASELINE_SCHEMA)).toBe(true);
    expect(hasImportSchema(a, ACE_IMPORT_DEDUPE_SCHEMA)).toBe(false);
  });

  it('dropping only acp_session breaks both gates (baseline and dedupe both read it)', () => {
    const db = makeFullDb();
    const a = adapt(db);
    db.exec('DROP TABLE acp_session');
    expect(hasImportSchema(a, ACE_IMPORT_BASELINE_SCHEMA)).toBe(false);
    expect(hasImportSchema(a, ACE_IMPORT_DEDUPE_SCHEMA)).toBe(false);
  });

  it('rejects requirement objects that are not the exported constants', () => {
    const a = adapt(makeFullDb());
    const forged = { conversations: ['id'] } as unknown as typeof ACE_IMPORT_BASELINE_SCHEMA;
    expect(hasImportSchema(a, forged)).toBe(false);
  });
});

describe('readImportedCliSessionIds (baseline includes archived rows)', () => {
  it('returns archived and active sids; ignores missing/empty/non-text/object/array sids', () => {
    const db = makeFullDb();
    insertConversation(db, 'active', { cli_session_id: 's-active' });
    insertConversation(db, 'archived', { cli_session_id: 's-archived' }, { archived: 1791621840771 });
    insertConversation(db, 'no-key', { backend: 'claude' });
    insertConversation(db, 'empty', { cli_session_id: '' });
    insertConversation(db, 'number', { cli_session_id: 42 });
    insertConversation(db, 'null', { cli_session_id: null });
    insertConversation(db, 'object', { cli_session_id: { a: 1 } });
    insertConversation(db, 'array', { cli_session_id: ['x'] });
    const ids = readImportedCliSessionIds(adapt(db));
    expect([...ids].sort()).toEqual(['s-active', 's-archived']);
  });

  it('is source-agnostic: the same sid from any backend counts once', () => {
    const db = makeFullDb();
    insertConversation(db, 'c1', { cli_session_id: 'same', cli_source: 'claude-code' });
    insertConversation(db, 'c2', { cli_session_id: 'same', cli_source: 'codex' });
    expect(readImportedCliSessionIds(adapt(db)).size).toBe(1);
  });
});

describe('readAcpSessionIds (every session aioncore points a conversation at, orphans included)', () => {
  it('counts native, archived-native and orphan pointers; ignores NULL, empty and BLOB values', () => {
    const db = makeFullDb();
    insertConversation(db, 'N', { backend: 'claude' });
    insertConversation(db, 'NA', { backend: 'claude' }, { archived: 1791621840771 });
    const acp = db.prepare('INSERT INTO acp_session VALUES (?, ?)');
    acp.run('N', 's-native');
    acp.run('NA', 's-archived');
    acp.run('gone', 's-orphan'); // conversation row already deleted
    acp.run('null-pointer', null);
    acp.run('empty-pointer', '');
    // TEXT affinity stores a number as text, so the typeof guard only ever filters BLOB / NULL.
    db.exec(`INSERT INTO acp_session VALUES ('blob-pointer', x'4142')`);
    expect([...readAcpSessionIds(adapt(db))].toSorted()).toEqual(['s-archived', 's-native', 's-orphan']);
  });
});

describe('importCliSessions baseline (read-only DB, archived rows included)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessions([]);
    rmSync(h.dataDir, { recursive: true, force: true });
    createInvoke().mockResolvedValue({ id: 'new' });
    listInvoke().mockResolvedValue({ items: [] });
  });

  it('skips a session whose conversation is ARCHIVED and never re-creates it', async () => {
    seedBackendDb([{ id: 'c-arch', extra: { cli_session_id: 'A' }, archived: 1791621840771 }]);
    setSessions([meta('codex', 'A')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 0, skipped: 1, failed: 0, errors: [] });
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('is source-agnostic: one session per source, the archived one skipped, the rest created', async () => {
    seedBackendDb([{ id: 'c-arch', extra: { cli_session_id: 'c1' }, archived: 1 }]);
    setSessions([meta('claude-code', 'a1'), meta('codex', 'c1'), meta('gemini', 'g1'), meta('opencode', 'o1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 3, skipped: 1, failed: 0 });
    const created = createInvoke().mock.calls.map(
      (c) => (c[0] as { extra: { cli_session_id: string } }).extra.cli_session_id
    );
    expect(created.sort()).toEqual(['a1', 'g1', 'o1']);
    // The HTTP list is NOT the baseline any more (only consulted when the DB baseline is empty).
    expect(listInvoke()).not.toHaveBeenCalled();
  });

  it('aborts with db-unavailable when the DB file is missing (create never called)', async () => {
    setSessions([meta('claude-code', 'a1'), meta('codex', 'c1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(2);
    expect(res.imported).toBe(0);
    expect(res.errors.join('\n')).toContain('db-unavailable');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('aborts with schema-mismatch when conversations lacks the extra column', async () => {
    seedBackendDb(
      [],
      `CREATE TABLE conversations (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL);
       CREATE TABLE acp_session (conversation_id TEXT PRIMARY KEY, session_id TEXT)`
    );
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(1);
    expect(res.errors.join('\n')).toContain('schema-mismatch');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('aborts with query-failed on malformed extra JSON (fail-closed)', async () => {
    seedBackendDb([{ id: 'bad', extra: '{not json' }]);
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(1);
    expect(res.errors.join('\n')).toContain('query-failed');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('tripwire: empty DB baseline but the list reports imported rows → baseline-suspect', async () => {
    seedBackendDb([]);
    listInvoke().mockResolvedValue({ items: [{ id: 'x', extra: { cli_session_id: 'ghost' } }] });
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(1);
    expect(res.errors.join('\n')).toContain('baseline-suspect');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('tripwire ignores non-string / empty cli_session_id values in the list', async () => {
    seedBackendDb([]);
    listInvoke().mockResolvedValue({
      items: [
        { id: 'x', extra: { cli_session_id: '' } },
        { id: 'y', extra: { cli_session_id: 7 } },
      ],
    });
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 1, failed: 0 });
  });

  it('tripwire: empty DB baseline and the list call throws → list-failed', async () => {
    seedBackendDb([]);
    listInvoke().mockRejectedValue(new Error('500'));
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(1);
    expect(res.errors.join('\n')).toContain('list-failed');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('true first import: empty DB baseline and empty list → proceeds', async () => {
    seedBackendDb([]);
    setSessions([meta('claude-code', 'a1'), meta('gemini', 'g1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({
      imported: 2,
      skipped: 0,
      failed: 0,
      duplicatesRemoved: 0,
      duplicatesSkipped: 0,
      removedIds: [],
    });
    expect(createInvoke()).toHaveBeenCalledTimes(2);
  });

  it('production branch: imported rows exist, so native-owned sids are skipped without consulting the list', async () => {
    seedBackendDb([
      { id: 'A', extra: { cli_session_id: 'A' } },
      { id: 'N', extra: { backend: 'claude' } },
    ]);
    seedRelated({ acp: [['N', 'S']] });
    setSessions([meta('claude-code', 'A'), meta('claude-code', 'S'), meta('codex', 'B')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 1, skipped: 2, failed: 0 });
    expect(
      createInvoke().mock.calls.map((c) => (c[0] as { extra: { cli_session_id: string } }).extra.cli_session_id)
    ).toEqual(['B']);
    expect(listInvoke()).not.toHaveBeenCalled();
  });

  it('skips the session of a native conversation (no imported rows yet)', async () => {
    seedBackendDb([{ id: 'N', extra: { backend: 'claude' } }]);
    seedRelated({ acp: [['N', 'S']] });
    setSessions([meta('claude-code', 'S')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('skips the session of a DELETED conversation whose orphan acp_session row survives', async () => {
    seedBackendDb([]);
    seedRelated({ acp: [['gone', 'S2']] });
    setSessions([meta('claude-code', 'S2')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('tripwire is not masked by acp_session: no imported rows + list reports imported rows → baseline-suspect', async () => {
    seedBackendDb([{ id: 'N', extra: { backend: 'claude' } }]);
    seedRelated({ acp: [['N', 'S']] });
    listInvoke().mockResolvedValue({ items: [{ id: 'x', extra: { cli_session_id: 'ghost' } }] });
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.errors.join('\n')).toContain('baseline-suspect');
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('no imported rows, empty list, non-empty acp_session → proceeds after exactly one list check', async () => {
    seedBackendDb([]);
    seedRelated({ acp: [['gone', 'S']] });
    setSessions([meta('claude-code', 'S'), meta('gemini', 'B')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 1, skipped: 1, failed: 0 });
    expect(listInvoke()).toHaveBeenCalledTimes(1);
  });

  it('an import re-pointed by aioncore keeps both its own sid and the new pointer out of the import', async () => {
    seedBackendDb([{ id: 'X', extra: { cli_session_id: 'T' } }]);
    seedRelated({ acp: [['X', 'T2']] });
    setSessions([meta('claude-code', 'T'), meta('claude-code', 'T2')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 0, skipped: 2, failed: 0 });
    expect(createInvoke()).not.toHaveBeenCalled();
  });

  it('aborts with schema-mismatch when acp_session is missing (fail closed, never duplicate)', async () => {
    seedBackendDb(
      [],
      `CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'u1', extra TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, archived_at INTEGER)`
    );
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.failed).toBe(1);
    expect(res.errors.join('\n')).toContain('schema-mismatch');
    expect(createInvoke()).not.toHaveBeenCalled();
  });
});

describe('scanCliSessions shares the baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSessions([]);
    rmSync(h.dataDir, { recursive: true, force: true });
    listInvoke().mockResolvedValue({ items: [] });
  });

  it('returns null when the baseline is unavailable', async () => {
    setSessions([meta('claude-code', 'a1')]);
    expect(await scanCliSessions()).toBeNull();
  });

  it('does not count an archived (already imported) session as new', async () => {
    seedBackendDb([{ id: 'c-arch', extra: { cli_session_id: 'A' }, archived: 1 }]);
    setSessions([meta('codex', 'A'), meta('codex', 'B')]);
    const scan = await scanCliSessions();
    expect(scan).toEqual({ total: 1, bySource: { 'claude-code': 0, codex: 1, gemini: 0, opencode: 0 } });
  });

  it('does not count native-owned or orphan-owned sessions as new', async () => {
    seedBackendDb([
      { id: 'A', extra: { cli_session_id: 'A' } },
      { id: 'N', extra: { backend: 'claude' } },
    ]);
    seedRelated({
      acp: [
        ['N', 'S'],
        ['gone', 'S2'],
      ],
    });
    setSessions([meta('claude-code', 'A'), meta('claude-code', 'S'), meta('claude-code', 'S2'), meta('codex', 'B')]);
    const scan = await scanCliSessions();
    expect(scan).toEqual({ total: 1, bySource: { 'claude-code': 0, codex: 1, gemini: 0, opencode: 0 } });
  });
});

describe('findDuplicateImportLosers (same user + sid, earliest import survives, flags in outer query)', () => {
  it('ranks A/B/C/D; other-user, fork and object/array sids never join a group; output is ordered', () => {
    const db = makeFullDb();
    insertConversation(db, 'A', { cli_session_id: 'S' }, { created: 1, archived: 1 });
    insertConversation(db, 'B', { cli_session_id: 'S' }, { created: 2 });
    insertConversation(db, 'C', { cli_session_id: 'S' }, { created: 2 }); // same created_at, later rowid
    insertConversation(db, 'D', { cli_session_id: 'S' }, { created: 3, archived: 1 });
    insertConversation(db, 'E-other-user', { cli_session_id: 'S' }, { user: 'u2', created: 0 });
    insertConversation(db, 'K-fork', { cli_session_id: 'S', fork: { from: 'A' } }, { created: 0 });
    insertConversation(db, 'O-object', { cli_session_id: { a: 1 } }, { created: 0 });
    insertConversation(db, 'P-array', { cli_session_id: ['S'] }, { created: 0 });
    insertConversation(db, 'T1', { cli_session_id: 'T' }, { created: 1 });
    insertConversation(db, 'T2', { cli_session_id: 'T' }, { created: 2 });
    const msg = db.prepare('INSERT INTO messages VALUES (?, ?)');
    msg.run('live-a', 'A');
    msg.run('live-b', 'B');
    msg.run('cli-c-1', 'C');
    msg.run('cli-d-1', 'D');
    const cron = db.prepare('INSERT INTO cron_jobs VALUES (?, ?)');
    cron.run('job-a', 'A');
    cron.run('job-c', 'C');

    const losers = findDuplicateImportLosers(adapt(db));
    expect(losers).toEqual([
      { id: 'B', cliSessionId: 'S', archived: false, hasLiveTurns: true, hasCronJobs: false },
      { id: 'C', cliSessionId: 'S', archived: false, hasLiveTurns: false, hasCronJobs: true },
      { id: 'D', cliSessionId: 'S', archived: true, hasLiveTurns: false, hasCronJobs: false },
      { id: 'T2', cliSessionId: 'T', archived: false, hasLiveTurns: false, hasCronJobs: false },
    ]);
    for (const l of losers) {
      expect(typeof l.archived).toBe('boolean');
      expect(typeof l.hasLiveTurns).toBe('boolean');
      expect(typeof l.hasCronJobs).toBe('boolean');
    }
  });

  it('returns nothing when every sid is unique', () => {
    const db = makeFullDb();
    insertConversation(db, 'a', { cli_session_id: 'x' }, { created: 1 });
    insertConversation(db, 'b', { cli_session_id: 'y' }, { created: 2, archived: 1 });
    expect(findDuplicateImportLosers(adapt(db))).toEqual([]);
  });

  it('a native acp_session owner outranks every import; natives, orphans, self-pointers, forks and other users never lose', () => {
    const db = makeFullDb();
    const native = { backend: 'claude' };
    const acp = db.prepare('INSERT INTO acp_session VALUES (?, ?)');
    // S: the native N was created AFTER I1, yet still survives; I1 carries its own NULL pointer row.
    insertConversation(db, 'N', native, { created: 5 });
    acp.run('N', 'S');
    insertConversation(db, 'I1', { cli_session_id: 'S' }, { created: 1 });
    acp.run('I1', null);
    insertConversation(db, 'I2', { cli_session_id: 'S' }, { created: 2 });
    db.prepare('INSERT INTO messages VALUES (?, ?)').run('live-i2', 'I2');
    // Q: two natives claim the same session; only the import loses.
    insertConversation(db, 'N1', native, { created: 1 });
    insertConversation(db, 'N2', native, { created: 2 });
    acp.run('N1', 'Q');
    acp.run('N2', 'Q');
    insertConversation(db, 'ZQ', { cli_session_id: 'Q' }, { created: 3 });
    // W: an archived native still owns its session; the active copy loses.
    insertConversation(db, 'NA', native, { created: 1, archived: 1 });
    acp.run('NA', 'W');
    insertConversation(db, 'ZA', { cli_session_id: 'W' }, { created: 2 });
    // T: an import's own pointer row never makes it claim against itself.
    insertConversation(db, 'X', { cli_session_id: 'T' }, { created: 1 });
    acp.run('X', 'T');
    // U: an orphan pointer (conversation deleted) protects nothing and deletes nothing. A LEFT JOIN
    // would pass too (the orphan's NULL user_id forms its own partition): this pins behaviour, not the JOIN.
    insertConversation(db, 'Y', { cli_session_id: 'U' }, { created: 1 });
    acp.run('gone', 'U');
    // V: a native of another user never outranks this user's import.
    insertConversation(db, 'NU2', native, { user: 'u2', created: 0 });
    acp.run('NU2', 'V');
    insertConversation(db, 'Z', { cli_session_id: 'V' }, { created: 1 });
    // R: a fork of an import (extra.fork) neither claims nor loses, even with its own pointer.
    insertConversation(db, 'F', { cli_session_id: 'R', fork: { from: 'IR' } }, { created: 2 });
    acp.run('F', 'R');
    insertConversation(db, 'IR', { cli_session_id: 'R' }, { created: 1 });

    expect(findDuplicateImportLosers(adapt(db))).toEqual([
      { id: 'ZQ', cliSessionId: 'Q', archived: false, hasLiveTurns: false, hasCronJobs: false },
      { id: 'I1', cliSessionId: 'S', archived: false, hasLiveTurns: false, hasCronJobs: false },
      { id: 'I2', cliSessionId: 'S', archived: false, hasLiveTurns: true, hasCronJobs: false },
      { id: 'ZA', cliSessionId: 'W', archived: false, hasLiveTurns: false, hasCronJobs: false },
    ]);
  });
});

afterAll(() => {
  rmSync(h.dataDir, { recursive: true, force: true });
});

describe('importCliSessions duplicate cleanup (protected, backend endpoints only)', () => {
  const removeInvoke = () => h.ipcBridge.conversation.remove.invoke as ReturnType<typeof vi.fn>;
  const archivedDeleteInvoke = () => h.ipcBridge.sidebar.deleteArchivedItem.invoke as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setSessions([]);
    rmSync(h.dataDir, { recursive: true, force: true });
    createInvoke().mockResolvedValue({ id: 'new' });
    listInvoke().mockResolvedValue({ items: [] });
    removeInvoke().mockResolvedValue(true);
    archivedDeleteInvoke().mockResolvedValue(undefined);
  });

  it('removes an unprotected later duplicate through conversation.remove only', async () => {
    seedBackendDb([
      { id: 'X1', extra: { cli_session_id: 'S' }, created: 1 },
      { id: 'X2', extra: { cli_session_id: 'S' }, created: 2 },
    ]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(removeInvoke()).toHaveBeenCalledTimes(1);
    expect(removeInvoke()).toHaveBeenCalledWith({ id: 'X2' });
    expect(res).toMatchObject({ duplicatesRemoved: 1, duplicatesSkipped: 0, removedIds: ['X2'], errors: [] });
    expect(archivedDeleteInvoke()).not.toHaveBeenCalled();
    expectSidebarUntouchedExcept();
    expectNoLocalFileChannelTouched();
  });

  it('records a failing delete in errors and continues with the next loser', async () => {
    seedBackendDb([
      { id: 'X1', extra: { cli_session_id: 'S' }, created: 1 },
      { id: 'X2', extra: { cli_session_id: 'S' }, created: 2 },
      { id: 'X3', extra: { cli_session_id: 'S' }, created: 3 },
    ]);
    removeInvoke().mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'X2') throw new Error('backend 500');
      return true;
    });
    const res = await importCliSessions(NO_TERMINAL);
    expect(res.duplicatesRemoved).toBe(1);
    expect(res.removedIds).toEqual(['X3']);
    expect(res.errors.join('\n')).toContain('cleanup S: backend 500');
    expect(res.failed).toBe(0);
    expectNoLocalFileChannelTouched();
  });

  it('keeps losers that have live turns, cron bindings or an open terminal', async () => {
    seedBackendDb([
      { id: 'P1', extra: { cli_session_id: 'P' }, created: 1 },
      { id: 'P2', extra: { cli_session_id: 'P' }, created: 2 },
      { id: 'Q1', extra: { cli_session_id: 'Q' }, created: 1 },
      { id: 'Q2', extra: { cli_session_id: 'Q' }, created: 2 },
      { id: 'R1', extra: { cli_session_id: 'R' }, created: 1 },
      { id: 'R2', extra: { cli_session_id: 'R' }, created: 2 },
    ]);
    seedRelated({ liveMessageFor: ['P2'], cronFor: ['Q2'] });
    const res = await importCliSessions({ hasOpenTerminal: (id) => id === 'R2' });
    expect(removeInvoke()).not.toHaveBeenCalled();
    expect(archivedDeleteInvoke()).not.toHaveBeenCalled();
    expect(res).toMatchObject({ duplicatesRemoved: 0, duplicatesSkipped: 3, removedIds: [] });
    expectNoLocalFileChannelTouched();
  });

  it('a throwing terminal check keeps the loser (unknown = protected) and records the error', async () => {
    seedBackendDb([
      { id: 'X1', extra: { cli_session_id: 'S' }, created: 1 },
      { id: 'X2', extra: { cli_session_id: 'S' }, created: 2 },
    ]);
    const res = await importCliSessions({
      hasOpenTerminal: () => {
        throw new Error('manager exploded');
      },
    });
    expect(removeInvoke()).not.toHaveBeenCalled();
    expect(res).toMatchObject({ duplicatesRemoved: 0, duplicatesSkipped: 1, failed: 0 });
    expect(res.errors.join('\n')).toContain('terminal check failed, kept: manager exploded');
  });

  it('a cli-only message row does not protect a loser', async () => {
    seedBackendDb([
      { id: 'X1', extra: { cli_session_id: 'S' }, created: 1 },
      { id: 'X2', extra: { cli_session_id: 'S' }, created: 2 },
    ]);
    seedRelated({ cliMessageFor: ['X2'] });
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ duplicatesRemoved: 1, duplicatesSkipped: 0, removedIds: ['X2'] });
  });

  it('deletes an ARCHIVED loser through sidebar.deleteArchivedItem, never conversation.remove', async () => {
    seedBackendDb([
      { id: 'Y1', extra: { cli_session_id: 'S' }, created: 1 },
      { id: 'Y2', extra: { cli_session_id: 'S' }, created: 2, archived: 1791621840771 },
    ]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(archivedDeleteInvoke()).toHaveBeenCalledTimes(1);
    expect(archivedDeleteInvoke()).toHaveBeenCalledWith({ item_type: 'conversation', item_id: 'Y2' });
    expect(removeInvoke()).not.toHaveBeenCalled();
    expect(res).toMatchObject({ duplicatesRemoved: 1, removedIds: ['Y2'] });
    expectSidebarUntouchedExcept('deleteArchivedItem');
    expectNoLocalFileChannelTouched();
  });

  it('the earlier ARCHIVED original survives; the later active copy is the loser', async () => {
    seedBackendDb([
      { id: 'orig', extra: { cli_session_id: 'S' }, created: 1, archived: 1 },
      { id: 'reimported', extra: { cli_session_id: 'S' }, created: 2 },
    ]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(removeInvoke()).toHaveBeenCalledWith({ id: 'reimported' });
    expect(archivedDeleteInvoke()).not.toHaveBeenCalled();
    expect(res.removedIds).toEqual(['reimported']);
  });

  it('removes an imported copy of a NATIVE conversation through conversation.remove only; the native survives', async () => {
    seedBackendDb([
      { id: 'N', extra: { backend: 'claude' }, created: 5 },
      { id: 'C', extra: { cli_session_id: 'S' }, created: 1 },
    ]);
    // C was opened once, so aioncore also points C's own row at the shared session.
    seedRelated({
      acp: [
        ['N', 'S'],
        ['C', 'S'],
      ],
    });
    const res = await importCliSessions(NO_TERMINAL);
    expect(removeInvoke()).toHaveBeenCalledTimes(1);
    expect(removeInvoke()).toHaveBeenCalledWith({ id: 'C' });
    expect(res).toMatchObject({ duplicatesRemoved: 1, duplicatesSkipped: 0, removedIds: ['C'], errors: [] });
    expectSidebarUntouchedExcept();
    expectNoLocalFileChannelTouched();
  });

  it('keeps an imported copy of a native conversation that has in-app turns', async () => {
    seedBackendDb([
      { id: 'N', extra: { backend: 'claude' }, created: 5 },
      { id: 'C', extra: { cli_session_id: 'S' }, created: 1 },
    ]);
    seedRelated({
      acp: [
        ['N', 'S'],
        ['C', 'S'],
      ],
      liveMessageFor: ['C'],
    });
    const res = await importCliSessions(NO_TERMINAL);
    expect(removeInvoke()).not.toHaveBeenCalled();
    expect(res).toMatchObject({ duplicatesRemoved: 0, duplicatesSkipped: 1, removedIds: [] });
    expectNoLocalFileChannelTouched();
  });

  it('cleanup-side schema mismatch degrades to an errors entry while the import itself proceeds', async () => {
    seedBackendDb(
      [],
      `CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'u1', extra TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, archived_at INTEGER);
       CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL);
       CREATE TABLE acp_session (conversation_id TEXT PRIMARY KEY, session_id TEXT)`
    );
    setSessions([meta('claude-code', 'a1')]);
    const res = await importCliSessions(NO_TERMINAL);
    expect(res).toMatchObject({ imported: 1, failed: 0, duplicatesRemoved: 0 });
    expect(res.errors.join('\n')).toContain('cleanup skipped: schema-mismatch');
    expect(removeInvoke()).not.toHaveBeenCalled();
    expectNoLocalFileChannelTouched();
  });
});

describe('hasOpenTerminalIn (real TerminalManager + fake pty)', () => {
  it('false without manager / terminals; true while open, even after exit, until disposed', () => {
    const spawn = createSpawnSpy();
    const manager = new TerminalManager({ spawn: spawn.fn, emitExit: vi.fn() });
    expect(hasOpenTerminalIn(null, 'c1')).toBe(false);
    expect(hasOpenTerminalIn(manager, 'c1')).toBe(false);

    manager.create({ conversationId: 'c1', cwd: '/tmp' });
    expect(hasOpenTerminalIn(manager, 'c1')).toBe(true);
    expect(hasOpenTerminalIn(manager, 'other')).toBe(false);

    const pty = spawn.lastPty;
    if (!pty) throw new Error('fake pty not spawned');
    pty.__emitExit(0);
    // Exited but not closed: still "open" (safer direction for a cleanup guard).
    expect(hasOpenTerminalIn(manager, 'c1')).toBe(true);

    manager.disposeByConversation('c1');
    expect(hasOpenTerminalIn(manager, 'c1')).toBe(false);
  });
});

describe('renderer helpers (useImportCliSessions pure functions)', () => {
  const t = ((key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}(${Object.values(opts).join(',')})` : key) as unknown as TFunction;
  const base = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    duplicatesRemoved: 0,
    duplicatesSkipped: 0,
    removedIds: [],
  };

  it('resolveScanAction: null → scan-failed, 0 → import-direct, >0 → confirm', () => {
    expect(resolveScanAction(null)).toBe('scan-failed');
    expect(resolveScanAction({ total: 0, bySource: { 'claude-code': 0, codex: 0, gemini: 0, opencode: 0 } })).toBe(
      'import-direct'
    );
    expect(resolveScanAction({ total: 3, bySource: { 'claude-code': 3, codex: 0, gemini: 0, opencode: 0 } })).toBe(
      'confirm'
    );
  });

  it('releaseRemovedConversations: emit + dispose per id, rejection swallowed, empty list no-op', async () => {
    const emit = vi.fn();
    const dispose = vi.fn().mockRejectedValue(new Error('ipc down'));
    expect(() => releaseRemovedConversations(['a', 'b'], { emit, dispose })).not.toThrow();
    await Promise.resolve();
    expect(emit.mock.calls).toEqual([['a'], ['b']]);
    expect(dispose.mock.calls).toEqual([['a'], ['b']]);
    emit.mockClear();
    dispose.mockClear();
    releaseRemovedConversations([], { emit, dispose });
    expect(emit).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('buildImportSummary: removed duplicates → success text containing the count', () => {
    const s = buildImportSummary({ ...base, imported: 1, duplicatesRemoved: 2 }, t);
    expect(s.level).toBe('success');
    expect(s.text).toContain('conversation.importCli.duplicatesRemoved(2)');
    expect(s.text).toContain('conversation.importCli.separator');
    expect(s.text.startsWith('conversation.importCli.done(')).toBe(true);
  });

  it('buildImportSummary: kept duplicates → warning with the kept count', () => {
    const s = buildImportSummary({ ...base, duplicatesSkipped: 1 }, t);
    expect(s.level).toBe('warning');
    expect(s.text).toContain('conversation.importCli.duplicatesKept(1)');
  });

  it('buildImportSummary: zero items are hidden', () => {
    const s = buildImportSummary({ ...base, imported: 1 }, t);
    expect(s.level).toBe('success');
    expect(s.text).toContain('conversation.importCli.summaryImported(1)');
    expect(s.text).not.toContain('duplicatesRemoved');
    expect(s.text).not.toContain('duplicatesKept');
    expect(s.text).not.toContain('summaryFailed');
  });

  it('buildImportSummary: failures → warning with summaryFailed', () => {
    const s = buildImportSummary({ ...base, imported: 1, failed: 2 }, t);
    expect(s.level).toBe('warning');
    expect(s.text).toContain('conversation.importCli.summaryFailed(2)');
  });

  it('buildImportSummary: errors-only result is a warning, not nothing', () => {
    const s = buildImportSummary({ ...base, errors: ['cleanup skipped: schema-mismatch: x'] }, t);
    expect(s.level).toBe('warning');
  });

  it('buildImportSummary: all zero and no errors → nothing / nothingNew', () => {
    const s = buildImportSummary({ ...base }, t);
    expect(s).toEqual({ level: 'nothing', text: 'conversation.importCli.nothingNew' });
  });

  it('buildImportSummary: tolerates a legacy result without the cleanup fields', () => {
    const legacy = { imported: 1, skipped: 2, failed: 0, errors: [] } as unknown as Parameters<
      typeof buildImportSummary
    >[0];
    const s = buildImportSummary(legacy, t);
    expect(s.level).toBe('success');
    expect(s.text).toContain('conversation.importCli.summarySkipped(2)');
    expect(s.text).not.toContain('duplicatesRemoved');
    // skipped-only (nothing imported, nothing cleaned) still reads as "nothing new"
    expect(buildImportSummary({ ...legacy, imported: 0 }, t).level).toBe('nothing');
  });
});
