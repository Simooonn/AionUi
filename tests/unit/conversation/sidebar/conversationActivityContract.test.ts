import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliSource, ParsedCliMessage } from '@/common/ace/types';

const h = vi.hoisted(() => ({
  dataDir: '',
  opens: [] as unknown[],
  queries: [] as string[],
  closed: 0,
  failQuery: false,
}));
vi.mock('@process/utils', () => ({ getDataPath: () => h.dataDir }));
vi.mock('better-sqlite3', async () => {
  const { DatabaseSync: Sqlite } = await import('node:sqlite');
  const { existsSync: exists } = await import('node:fs');
  return {
    default: class {
      private readonly db: InstanceType<typeof Sqlite>;
      constructor(path: string, options?: { readonly?: boolean; fileMustExist?: boolean }) {
        h.opens.push(options);
        if (options?.fileMustExist && !exists(path)) throw new Error('Database does not exist');
        this.db = new Sqlite(path, { readOnly: options?.readonly });
      }
      pragma(sql: string) {
        return this.db.prepare(`PRAGMA ${sql}`).all();
      }
      prepare(sql: string) {
        h.queries.push(sql);
        if (h.failQuery) throw new Error('Query failed');
        return this.db.prepare(sql);
      }
      close() {
        h.closed += 1;
        this.db.close();
      }
    },
  };
});

import { CHAT_ACTIVITY_TYPES, CLI_ROW_ID_PREFIX, CONVERSATION_ACTIVITY_TIMES_SQL } from '@process/ace/aioncoreSchema';
import { buildLiveRowIndex, mapRows, type LiveRowIndex } from '@process/ace/messageImporter';
import { findSessionFiles, parseSessionFiles } from '@process/ace/messageParser';
import { parseSessionFile as parseClaudeMetadata } from '@process/ace/parsers/claudeParser';
import { parseRolloutFile } from '@process/ace/parsers/codexParser';
import { pickChatActivityAt, resolveConversationActivityTimes } from '@process/ace/sessionFiles';

const START = 1_700_000_000_000;
const LAST = START + 20_000;
const CLI_TIME = LAST + 50_000;
const NOW = START + 9_000_000;
const dirs: string[] = [];
const databases: DatabaseSync[] = [];
const noDiskImages: Parameters<typeof mapRows>[6] = (_sessionId, images) =>
  images.map((_, i) => `/audit-only/image-${i}.png`);

type ActivityRow = { id: string; created_at: number; msg_at: number | null; cli_at: number | null };
type PersistedRow = { id: string; created_at: number };
type AuditResult = {
  status: 'consistent' | 'inconsistent' | 'unverified';
  reasons: string[];
  persisted: number;
  generated: number;
};

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aionui-activity-contract-'));
  dirs.push(dir);
  return dir;
}

function database(file = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(file);
  databases.push(db);
  // No timestamp affinity: intentionally preserve dirty text/NULL test inputs.
  db.exec(`CREATE TABLE conversations (id TEXT PRIMARY KEY, created_at, updated_at, extra TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, msg_id TEXT, type TEXT,
      content TEXT, position TEXT, status TEXT, hidden, created_at);
    CREATE INDEX messages_by_conversation ON messages(conversation_id);`);
  return db;
}

function conversation(db: DatabaseSync, id: string, extra: unknown = {}): void {
  db.prepare('INSERT INTO conversations VALUES (?, ?, ?, ?)').run(
    id,
    START,
    NOW,
    typeof extra === 'string' ? extra : JSON.stringify(extra)
  );
}

function message(
  db: DatabaseSync,
  id: string,
  cid: string,
  type = 'text',
  at: number | string | null = LAST,
  hidden: number | null = 0
): void {
  db.prepare('INSERT INTO messages (id, conversation_id, type, created_at, hidden) VALUES (?, ?, ?, ?, ?)').run(
    id,
    cid,
    type,
    at,
    hidden
  );
}

function times(db: DatabaseSync): Record<string, number> {
  return Object.fromEntries(
    (db.prepare(CONVERSATION_ACTIVITY_TIMES_SQL).all() as ActivityRow[]).map((row) => [row.id, pickChatActivityAt(row)])
  );
}

function persist(db: DatabaseSync, rows: ReturnType<typeof mapRows>['rows']): void {
  const insert = db.prepare(
    'INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, hidden, created_at) VALUES (@id, @conversation_id, @msg_id, @type, @content, @position, @status, @hidden, @created_at)'
  );
  for (const row of rows) insert.run(row);
}

function claudeRecord(id: string, timestamp?: number, content: unknown = 'fixture message', role = 'user') {
  return {
    type: role,
    uuid: id,
    timestamp: timestamp === undefined ? undefined : new Date(timestamp).toISOString(),
    cwd: '/fixture',
    message: { role, content },
  };
}

function jsonl(records: unknown[], name = 'fixture.jsonl'): string {
  const file = join(tempDir(), name);
  writeFileSync(file, records.map((row) => JSON.stringify(row)).join('\n') + '\n');
  return file;
}

/** Exercise the production mapper for every prospective row, not just persisted ids. */
function auditMapping(
  cid: string,
  sid: string,
  source: CliSource,
  parsed: ParsedCliMessage[],
  persisted: PersistedRow[],
  liveIndex: LiveRowIndex = new Map(),
  liveToolIds = new Set<string>()
): AuditResult {
  const { rows, unmapped } = mapRows(cid, sid, source, parsed, liveIndex, liveToolIds, noDiskImages);
  const current = new Map(rows.map((row) => [row.id, row.created_at]));
  const reasons: string[] = [];
  let inconsistent = false;
  let unverified = unmapped > 0 || parsed.length === 0;
  if (unmapped) reasons.push(`unmapped-items:${unmapped}`);
  if (!parsed.length) reasons.push('no-parsed-messages');
  for (const item of parsed) {
    if (typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt >= 1e12) continue;
    const prospective = mapRows(cid, sid, source, [item], liveIndex, liveToolIds, noDiskImages).rows;
    for (const row of prospective) {
      if (row.hidden !== 0 || !CHAT_ACTIVITY_TYPES.some((type) => type === row.type)) continue;
      inconsistent = true;
      reasons.push(`invalid-source-time:${row.id}`);
    }
  }
  for (const row of persisted) {
    if (!current.has(row.id)) {
      unverified = true;
      reasons.push(`missing-source-id:${row.id}`);
    } else if (current.get(row.id) !== row.created_at) {
      inconsistent = true;
      reasons.push(`timestamp-mismatch:${row.id}`);
    }
  }
  return {
    status: inconsistent ? 'inconsistent' : unverified ? 'unverified' : 'consistent',
    reasons,
    persisted: persisted.length,
    generated: rows.length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  h.opens = [];
  h.queries = [];
  h.closed = 0;
  h.failQuery = false;
});

describe('batch conversation activity SQL', () => {
  it('ignores updated_at changes from pin, rename, opening and persisted pollution', () => {
    const db = database();
    conversation(db, 'chat');
    conversation(db, 'empty');
    message(db, 'm', 'chat');
    expect(times(db)).toEqual({ chat: LAST, empty: START });
    db.prepare('UPDATE conversations SET updated_at = ?').run(NOW + 60_000);
    expect(times(db)).toEqual({ chat: LAST, empty: START });
  });

  it.each(CHAT_ACTIVITY_TYPES)('counts visible %s messages and rounds real milliseconds', (type) => {
    const db = database();
    conversation(db, 'chat');
    message(db, 'm', 'chat', type, LAST + 0.6);
    expect(times(db)).toEqual({ chat: LAST + 1 });
  });

  it.each([
    'tips',
    'agent_status',
    'permission',
    'ask',
    'acp_permission',
    'acp_terminal_output',
    'available_commands',
    'unknown-new-type',
  ])('excludes %s messages', (type) => {
    const db = database();
    conversation(db, 'chat');
    message(db, 'valid', 'chat');
    message(db, 'ignored', 'chat', type, NOW);
    expect(times(db)).toEqual({ chat: LAST });
  });

  it.each([null, 0, -1, START / 1000, String(NOW), 'not-a-time', Infinity, -Infinity])(
    'excludes invalid message time %s',
    (at) => {
      const db = database();
      conversation(db, 'chat');
      message(db, 'valid', 'chat');
      message(db, 'ignored', 'chat', 'text', at);
      expect(times(db)).toEqual({ chat: LAST });
    }
  );

  it.each([null, 1, -1, 2])('excludes hidden=%s even with newer timestamps', (hidden) => {
    const db = database();
    conversation(db, 'chat');
    message(db, 'valid', 'chat');
    message(db, 'ignored', 'chat', 'text', NOW, hidden);
    expect(times(db)).toEqual({ chat: LAST });
  });

  it('uses max(M,C) only before any cli-prefixed row has been loaded', () => {
    const db = database();
    for (const id of ['unloaded', 'older-message', 'newer-message', 'loaded'])
      conversation(db, id, { cli_session_id: id, cli_source: 'codex', cli_updated_at: CLI_TIME });
    message(db, 'old', 'older-message');
    message(db, 'new', 'newer-message', 'text', NOW);
    message(db, 'live', 'loaded');
    message(db, `${CLI_ROW_ID_PREFIX}hidden`, 'loaded', 'tips', NOW, 1);
    expect(times(db)).toEqual({ unloaded: CLI_TIME, 'older-message': CLI_TIME, 'newer-message': NOW, loaded: LAST });
  });

  it.each([
    '{broken',
    null,
    [],
    '{"cli_session_id":"sid","cli_source":"codex","cli_updated_at":1e999}',
    { cli_session_id: '', cli_source: 'codex', cli_updated_at: CLI_TIME },
    { cli_session_id: '  ', cli_source: 'codex', cli_updated_at: CLI_TIME },
    { cli_session_id: 2, cli_source: 'codex', cli_updated_at: CLI_TIME },
    { cli_session_id: [], cli_source: 'codex', cli_updated_at: CLI_TIME },
    { cli_session_id: 'sid', cli_updated_at: CLI_TIME },
    { cli_session_id: 'sid', cli_source: ' ', cli_updated_at: CLI_TIME },
    { cli_session_id: 'sid', cli_source: {}, cli_updated_at: CLI_TIME },
    { cli_session_id: 'sid', cli_source: 'codex', cli_updated_at: 0 },
    { cli_session_id: 'sid', cli_source: 'codex', cli_updated_at: CLI_TIME / 1000 },
    { cli_session_id: 'sid', cli_source: 'codex', cli_updated_at: String(CLI_TIME) },
  ])('isolates invalid CLI metadata %# without failing the batch', (extra) => {
    const db = database();
    conversation(db, 'invalid', extra);
    conversation(db, 'valid', { cli_session_id: 'sid', cli_source: 'codex', cli_updated_at: CLI_TIME });
    expect(times(db)).toEqual({ invalid: START, valid: CLI_TIME });
  });

  it('rejects non-finite fallback rather than reporting a successful invalid mapping', () => {
    expect(() => pickChatActivityAt({ created_at: NaN, msg_at: null, cli_at: null })).toThrow(
      'Invalid conversation timestamp'
    );
    expect(pickChatActivityAt({ created_at: START, msg_at: Infinity, cli_at: Infinity })).toBe(START);
  });
});

describe('real parser → production mapRows → persisted CLI activity contract', () => {
  it('preserves Claude record times, split items, tools, image-only rows and late metadata C', () => {
    const file = jsonl([
      claudeRecord('user', START),
      claudeRecord(
        'assistant',
        LAST,
        [
          { type: 'text', text: 'reply' },
          { type: 'thinking', thinking: 'reasoning' },
          { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/fixture' } },
        ],
        'assistant'
      ),
      claudeRecord('image', LAST - 1, [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
      ]),
      { type: 'progress', timestamp: new Date(CLI_TIME).toISOString() },
    ]);
    const metadata = parseClaudeMetadata(file);
    const parsed = parseSessionFiles('claude-code', [file], 'sid');
    const rows = mapRows('chat', 'sid', 'claude-code', parsed, new Map(), new Set(), noDiskImages).rows;
    const db = database(join(tempDir(), 'fixture.db'));
    conversation(db, 'chat', { cli_session_id: 'sid', cli_source: 'claude-code', cli_updated_at: metadata?.updatedAt });
    expect(times(db)).toEqual({ chat: CLI_TIME });
    persist(db, rows);
    expect(db.prepare('SELECT id, created_at FROM messages ORDER BY id').all()).toEqual([
      { id: 'cli-assistant-0', created_at: LAST },
      { id: 'cli-assistant-1', created_at: LAST },
      { id: 'cli-assistant-2', created_at: LAST },
      { id: 'cli-image-img', created_at: LAST - 1 },
      { id: 'cli-user-0', created_at: START },
    ]);
    expect(times(db)).toEqual({ chat: LAST });
  });

  it('uses Codex file mtime before load and JSONL record time after load', () => {
    const file = jsonl([
      { type: 'session_meta', payload: { id: 'sid', cwd: '/fixture', timestamp: new Date(START).toISOString() } },
      {
        timestamp: new Date(START).toISOString(),
        type: 'response_item',
        payload: { role: 'user', content: [{ type: 'input_text', text: 'fixture prompt' }] },
      },
      {
        timestamp: new Date(LAST).toISOString(),
        type: 'response_item',
        payload: { role: 'assistant', content: [{ type: 'output_text', text: 'fixture reply' }] },
      },
    ]);
    utimesSync(file, CLI_TIME / 1000, CLI_TIME / 1000);
    const parsed = parseSessionFiles('codex', [file], 'sid');
    const rows = mapRows('chat', 'sid', 'codex', parsed, new Map(), new Set(), noDiskImages).rows;
    const db = database(join(tempDir(), 'fixture.db'));
    conversation(db, 'chat', {
      cli_session_id: 'sid',
      cli_source: 'codex',
      cli_updated_at: parseRolloutFile(file)?.updatedAt,
    });
    expect(times(db)).toEqual({ chat: CLI_TIME });
    persist(db, rows);
    expect(db.prepare('SELECT id, created_at FROM messages ORDER BY id').all()).toEqual([
      { id: 'cli-codex-sid-0-0', created_at: START },
      { id: 'cli-codex-sid-1-0', created_at: LAST },
    ]);
    expect(times(db)).toEqual({ chat: LAST });
  });

  it.each([false, true])('flags missing source time with matching old rows=%s, never passing vacuously', (withOld) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const file = jsonl([...(withOld ? [claudeRecord('old', START)] : []), claudeRecord('missing')]);
    const parsed = parseSessionFiles('claude-code', [file], 'sid');
    const persisted = withOld ? [{ id: 'cli-old-0', created_at: START }] : [];
    const db = database();
    conversation(db, 'chat', { cli_session_id: 'sid', cli_source: 'claude-code', cli_updated_at: CLI_TIME });
    const result = auditMapping('chat', 'sid', 'claude-code', parsed, persisted);
    expect(times(db)).toEqual({ chat: CLI_TIME });
    expect(result).toMatchObject({ status: 'inconsistent', reasons: ['invalid-source-time:cli-missing-0'] });
    expect(
      mapRows('chat', 'sid', 'claude-code', parsed, new Map(), new Set(), noDiskImages).rows.at(-1)?.created_at
    ).toBe(NOW);
  });

  it.each([false, true])('accepts legal prospective records with matching old rows=%s', (withOld) => {
    const parsed = parseSessionFiles(
      'claude-code',
      [jsonl([claudeRecord('old', START), claudeRecord('new', LAST)])],
      'sid'
    );
    expect(
      auditMapping('chat', 'sid', 'claude-code', parsed, withOld ? [{ id: 'cli-old-0', created_at: START }] : [])
    ).toEqual({ status: 'consistent', reasons: [], persisted: withOld ? 1 : 0, generated: 2 });
  });

  it('distinguishes timestamp mismatch from a persisted id absent in the current source', () => {
    const parsed = parseSessionFiles('claude-code', [jsonl([claudeRecord('old', START)])], 'sid');
    expect(auditMapping('chat', 'sid', 'claude-code', parsed, [{ id: 'cli-old-0', created_at: NOW }])).toMatchObject({
      status: 'inconsistent',
      reasons: ['timestamp-mismatch:cli-old-0'],
    });
    expect(
      auditMapping('chat', 'sid', 'claude-code', parsed, [{ id: 'cli-deleted-0', created_at: START }])
    ).toMatchObject({ status: 'unverified', reasons: ['missing-source-id:cli-deleted-0'] });
  });

  it('preserves production live-text and tool dedup in the audit mapping', () => {
    const parsed = parseSessionFiles(
      'claude-code',
      [jsonl([claudeRecord('live', START), claudeRecord('new', LAST)])],
      'sid'
    );
    const liveIndex = buildLiveRowIndex([
      { content: JSON.stringify({ content: 'fixture message' }), position: 'right', created_at: START },
    ]);
    expect(auditMapping('chat', 'sid', 'claude-code', parsed, [], liveIndex)).toMatchObject({
      status: 'consistent',
      generated: 0,
    });
  });
});

describe('read-only activity resolver', () => {
  it('reads one batch including committed WAL rows without touching conversation metadata', async () => {
    h.dataDir = tempDir();
    const db = database(join(h.dataDir, 'aionui-backend.db'));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0');
    conversation(db, 'chat');
    conversation(db, 'empty');
    message(db, 'm', 'chat');
    expect(await resolveConversationActivityTimes()).toEqual({ ok: true, times: { chat: LAST, empty: START } });
    expect({ opens: h.opens, queries: h.queries, closed: h.closed }).toEqual({
      opens: [{ readonly: true, fileMustExist: true }],
      queries: [CONVERSATION_ACTIVITY_TIMES_SQL],
      closed: 1,
    });
    expect(db.prepare('SELECT DISTINCT updated_at FROM conversations').all()).toEqual([{ updated_at: NOW }]);
  });

  it('reports missing databases without creating a new file', async () => {
    h.dataDir = tempDir();
    expect(await resolveConversationActivityTimes()).toEqual({ ok: false, reason: 'query-failed' });
    expect(existsSync(join(h.dataDir, 'aionui-backend.db'))).toBe(false);
  });

  it.each(['created_at', 'extra'])('returns schema-mismatch when conversations.%s is missing', async (column) => {
    h.dataDir = tempDir();
    const db = database(join(h.dataDir, 'aionui-backend.db'));
    db.exec(`ALTER TABLE conversations DROP COLUMN ${column}`);
    expect(await resolveConversationActivityTimes()).toEqual({ ok: false, reason: 'schema-mismatch' });
    expect(h.closed).toBe(1);
    expect(h.queries).toEqual([]);
  });

  it('returns schema-mismatch when messages.hidden is missing', async () => {
    h.dataDir = tempDir();
    const db = database(join(h.dataDir, 'aionui-backend.db'));
    db.exec('ALTER TABLE messages DROP COLUMN hidden');
    expect(await resolveConversationActivityTimes()).toEqual({ ok: false, reason: 'schema-mismatch' });
  });

  it('returns query-failed and closes the read-only handle after a SQL error', async () => {
    h.dataDir = tempDir();
    database(join(h.dataDir, 'aionui-backend.db'));
    h.failQuery = true;
    expect(await resolveConversationActivityTimes()).toEqual({ ok: false, reason: 'query-failed' });
    expect(h.closed).toBe(1);
  });

  it.each([null, 0, -1, START / 1000, String(START), Infinity])(
    'never returns ok for a fallback timestamp of %s',
    async (createdAt) => {
      h.dataDir = tempDir();
      const db = database(join(h.dataDir, 'aionui-backend.db'));
      conversation(db, 'invalid');
      db.prepare('UPDATE conversations SET created_at = ?').run(createdAt);
      expect(await resolveConversationActivityTimes()).toEqual({ ok: false, reason: 'query-failed' });
    }
  );
});

describe('activity IPC channel contract', () => {
  it('exposes the preload key on the same channel registered by main and preserves failures', async () => {
    const handlers = new Map<string, () => Promise<unknown>>();
    const exposed = new Map<string, unknown>();
    const invoke = vi.fn(async (channel: string) => handlers.get(channel)?.());
    vi.doMock('electron', () => ({
      ipcMain: { handle: (channel: string, handler: () => Promise<unknown>) => handlers.set(channel, handler) },
      contextBridge: { exposeInMainWorld: (name: string, value: unknown) => exposed.set(name, value) },
      ipcRenderer: { invoke, on: vi.fn(), sendSync: vi.fn(() => 0) },
      nativeImage: {},
      webUtils: {},
    }));
    vi.doMock('@sentry/electron/preload', () => ({}));
    vi.doMock('@process/utils/initStorage', () => ({ ProcessConfig: {} }));
    vi.doMock('@process/bridge/terminalBridge', () => ({ getTerminalManager: vi.fn() }));
    vi.doMock('@process/ace/importCliSessions', () => ({}));
    vi.doMock('@process/ace/sessionResume', () => ({}));
    vi.doMock('@process/ace/hudStatusline', () => ({}));
    vi.doMock('@process/ace/larkNotifySender', () => ({}));
    try {
      await import('@process/ace/aceBridge');
      await import('../../../../packages/desktop/src/preload/main');
      h.dataDir = tempDir();
      const db = database(join(h.dataDir, 'aionui-backend.db'));
      conversation(db, 'chat');
      message(db, 'm', 'chat');
      const api = exposed.get('electronAPI') as { conversationActivityTimes: () => Promise<unknown> };
      expect(await api.conversationActivityTimes()).toEqual({ ok: true, times: { chat: LAST } });
      expect(invoke).toHaveBeenCalledExactlyOnceWith('ace:conversation-activity-times');
      h.failQuery = true;
      expect(await api.conversationActivityTimes()).toEqual({ ok: false, reason: 'query-failed' });
    } finally {
      for (const module of [
        'electron',
        '@sentry/electron/preload',
        '@process/utils/initStorage',
        '@process/bridge/terminalBridge',
        '@process/ace/importCliSessions',
        '@process/ace/sessionResume',
        '@process/ace/hudStatusline',
        '@process/ace/larkNotifySender',
      ])
        vi.doUnmock(module);
    }
  });
});

describe.runIf(Boolean(process.env.AIONUI_AUDIT_DB))('explicit real-database read-only historical audit', () => {
  it('reports each imported conversation without writing the database or image cache', () => {
    const path = resolve(process.env.AIONUI_AUDIT_DB!);
    if (!existsSync(path)) throw new Error('Audit database must already exist');
    const db = new DatabaseSync(path, { readOnly: true });
    const results: Array<AuditResult & { id: string; source?: string; files?: string[]; cliAt?: number | null }> = [];
    let journal: unknown;
    try {
      db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 1000; BEGIN');
      journal = db.prepare('PRAGMA journal_mode').get();
      const activityRows = db.prepare(CONVERSATION_ACTIVITY_TIMES_SQL).all() as ActivityRow[];
      const cliTimes = new Map(activityRows.map((row) => [row.id, row.cli_at]));
      const candidates = db
        .prepare(`SELECT id, extra FROM conversations WHERE CASE WHEN json_valid(extra)
        THEN json_type(extra, '$.cli_session_id') IS NOT NULL OR json_type(extra, '$.cli_source') IS NOT NULL ELSE 0 END`)
        .all() as Array<{ id: string; extra: string }>;
      for (const candidate of candidates) {
        const extra = JSON.parse(candidate.extra) as { cli_session_id?: unknown; cli_source?: unknown };
        const source = extra.cli_source;
        const sid = extra.cli_session_id;
        const persisted = db
          .prepare(`SELECT id, created_at FROM messages WHERE conversation_id = ? AND id LIKE '${CLI_ROW_ID_PREFIX}%'`)
          .all(candidate.id) as PersistedRow[];
        const base = { id: candidate.id, cliAt: cliTimes.get(candidate.id), persisted: persisted.length, generated: 0 };
        if (
          typeof sid !== 'string' ||
          !sid.trim() ||
          !['claude-code', 'codex', 'gemini', 'opencode'].includes(String(source))
        ) {
          results.push({ ...base, status: 'unverified', reasons: ['invalid-cli-metadata'] });
          continue;
        }
        let files: string[] = [];
        try {
          files = findSessionFiles(source as CliSource, sid);
          if (!files.length) throw new Error('source-files-missing');
          const before = files.map((file) => {
            accessSync(file, constants.R_OK);
            const stats = statSync(file);
            // readLines intentionally swallows invalid JSON; audit cannot treat that as complete evidence.
            if (source !== 'opencode') {
              const raw = readFileSync(file, 'utf8');
              if (!raw.trim()) throw new Error('source-file-empty');
              if (file.endsWith('.jsonl'))
                for (const line of raw.split('\n').filter((value) => value.trim())) JSON.parse(line);
              else JSON.parse(raw);
            }
            return { size: stats.size, mtimeMs: stats.mtimeMs };
          });
          const parsed = parseSessionFiles(source as CliSource, files, sid);
          const liveRows = db
            .prepare(
              `SELECT content, position, created_at FROM messages WHERE conversation_id = ? AND id NOT LIKE '${CLI_ROW_ID_PREFIX}%' AND type IN ('text', 'thinking')`
            )
            .all(candidate.id) as Array<{ content: string; position: string; created_at: number }>;
          const liveTools = db
            .prepare(
              `SELECT msg_id FROM messages WHERE conversation_id = ? AND id NOT LIKE '${CLI_ROW_ID_PREFIX}%' AND type = 'acp_tool_call'`
            )
            .all(candidate.id) as Array<{ msg_id: string }>;
          const result = auditMapping(
            candidate.id,
            sid,
            source as CliSource,
            parsed,
            persisted,
            buildLiveRowIndex(liveRows),
            new Set(liveTools.map((row) => row.msg_id))
          );
          const changed = files.some((file, i) => {
            const after = statSync(file);
            return after.size !== before[i].size || after.mtimeMs !== before[i].mtimeMs;
          });
          results.push({
            ...base,
            ...result,
            source: String(source),
            files,
            ...(changed
              ? { status: 'unverified' as const, reasons: [...result.reasons, 'source-changed-during-audit'] }
              : {}),
          });
        } catch (error) {
          // Never include parser error text: JSON errors can contain conversation content.
          const reason =
            error instanceof Error && ['source-files-missing', 'source-file-empty'].includes(error.message)
              ? error.message
              : 'source-unreadable-or-invalid';
          results.push({ ...base, source: String(source), files, status: 'unverified', reasons: [reason] });
        }
      }
    } finally {
      db.close();
    }
    const reportPath = resolve('计划/AionUi/侧栏分页与聊天时间修正计划/audit.json');
    const report = existsSync(reportPath)
      ? (JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>)
      : {};
    report[path] = {
      checkedAt: new Date().toISOString(),
      readOnly: true,
      queryOnly: true,
      journal,
      counts: Object.fromEntries(
        ['consistent', 'inconsistent', 'unverified'].map((status) => [
          status,
          results.filter((row) => row.status === status).length,
        ])
      ),
      conversations: results,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    expect(
      results.filter((row) => row.status !== 'consistent').map(({ id, status, reasons }) => ({ id, status, reasons }))
    ).toEqual([]);
  }, 120_000);
});
