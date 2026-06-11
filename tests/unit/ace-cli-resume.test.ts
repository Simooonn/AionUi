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
import {
  buildLiveRowIndex,
  contentKey,
  escapeFilesMarker,
  isLiveDuplicate,
  materializeCliImages,
  toolCallContent,
  withFilesMarker,
} from '@process/ace/messageImporter';
import {
  cleanClaudeUserText,
  findGeminiFiles,
  isCodexInjectedText,
  parseSessionFile,
  parseSessionFiles,
} from '@process/ace/messageParser';
import { loadGeminiProjectHashMap, parseGeminiSessionFile } from '@process/ace/parsers/geminiParser';

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

describe('harness-injection noise filtering (imported history display)', () => {
  it('compacts a slash-command frame into "/cmd args"', () => {
    const frame =
      '<command-message>trace</command-message>\n<command-name>/trace</command-name>\n<command-args>"左侧列表为什么是空的"</command-args>';
    expect(cleanClaudeUserText(frame)).toBe('/trace "左侧列表为什么是空的"');
    expect(cleanClaudeUserText('<command-message>model</command-message>\n<command-name>/model</command-name>')).toBe(
      '/model'
    );
    expect(cleanClaudeUserText('<command-message>broken frame without name</command-message>')).toBe(null);
  });

  it('drops pure injection records (stdout / caveat / task-notification)', () => {
    expect(cleanClaudeUserText('<local-command-stdout>Set model to Fable 5</local-command-stdout>')).toBe(null);
    expect(cleanClaudeUserText('<local-command-caveat>Caveat: ...</local-command-caveat>')).toBe(null);
    expect(cleanClaudeUserText('<task-notification>\n<task-id>x</task-id>\n</task-notification>')).toBe(null);
    expect(cleanClaudeUserText('Caveat: The messages below were generated by the user while running...')).toBe(null);
    expect(cleanClaudeUserText('[Assistant Rules]\n## Team Mode\n...')).toBe(null);
    expect(cleanClaudeUserText('[Request interrupted by user]')).toBe(null);
    expect(cleanClaudeUserText('[Request interrupted by user for tool use]')).toBe(null);
    // bracket-leading REAL user text must survive (no blanket '[' rule)
    // attachment placeholders are stripped, the real ask survives (no blanket '[' rule)
    expect(cleanClaudeUserText('[Image #1]\n我发送消息提示我报错')).toBe('我发送消息提示我报错');
    expect(cleanClaudeUserText('[Image #3] [Image #4]\n这两张图里的消息很丑')).toBe('这两张图里的消息很丑');
    expect(cleanClaudeUserText('[Image #1] [Image #2]')).toBe(null); // image-only turn → nothing to show
  });

  it('strips appended <system-reminder> blocks but keeps the real user text', () => {
    expect(cleanClaudeUserText('修一下这个 bug\n<system-reminder>injected stuff</system-reminder>')).toBe(
      '修一下这个 bug'
    );
    expect(cleanClaudeUserText('<system-reminder>only injection</system-reminder>')).toBe(null);
    expect(cleanClaudeUserText('正常消息')).toBe('正常消息');
  });

  it('flags Codex injected user records, keeps real prompts', () => {
    expect(isCodexInjectedText('<environment_context>\n  <cwd>/x</cwd>\n</environment_context>')).toBe(true);
    expect(isCodexInjectedText('<turn_aborted>\nThe user interrupted the previous turn.\n</turn_aborted>')).toBe(true);
    expect(isCodexInjectedText('<user_instructions>AGENTS.md</user_instructions>')).toBe(true);
    expect(isCodexInjectedText('# AGENTS.md instructions for /Users/x/proj\n\n<INSTRUCTIONS>')).toBe(true);
    expect(isCodexInjectedText('# Files mentioned by the user:\n\n## c3c23b6a.png')).toBe(true);
    expect(isCodexInjectedText('<image name=[Image #1]>')).toBe(true);
    expect(isCodexInjectedText('</image>')).toBe(true);
    expect(isCodexInjectedText('帮我写个解析器')).toBe(false);
    expect(isCodexInjectedText('# 标题开头的真实提问呢')).toBe(false);
  });
});

describe('parseSessionFile end-to-end noise filtering', () => {
  it('claude: skips isMeta, folds compact-summary, transforms command frames, keeps real turns', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-parse-'));
    const file = join(dir, 'session.jsonl');
    const lines = [
      { type: 'user', uuid: 'u1', timestamp: '2026-06-10T08:00:00Z', message: { role: 'user', content: '你好' } },
      {
        type: 'user',
        uuid: 'u2',
        isMeta: true,
        timestamp: '2026-06-10T08:00:01Z',
        message: { role: 'user', content: 'Continue from where you left off.' },
      },
      {
        type: 'user',
        uuid: 'u3',
        timestamp: '2026-06-10T08:00:02Z',
        message: { role: 'user', content: '<command-name>/model</command-name>\n<command-args>opus</command-args>' },
      },
      {
        type: 'user',
        uuid: 'u4',
        timestamp: '2026-06-10T08:00:03Z',
        message: { role: 'user', content: '<local-command-stdout>Set model</local-command-stdout>' },
      },
      {
        type: 'user',
        uuid: 'u5',
        isCompactSummary: true,
        timestamp: '2026-06-10T08:00:04Z',
        message: {
          role: 'user',
          content: 'This session is being continued from a previous conversation that ran out of context...',
        },
      },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-06-10T08:00:05Z',
        message: { role: 'assistant', content: [{ type: 'text', text: '收到' }] },
      },
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));

    const parsed = parseSessionFile('claude-code', file, 'session');
    expect(parsed.map((m) => m.items[0])).toEqual([
      { kind: 'text', text: '你好' },
      { kind: 'text', text: '/model opus' },
      // compact summary becomes a dedicated collapsed item, raw text preserved
      {
        kind: 'compact-summary',
        text: 'This session is being continued from a previous conversation that ran out of context...',
      },
      { kind: 'text', text: '收到' },
    ]);
  });

  it('codex: drops injected user records; positional ids stay session-scoped', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-parse-'));
    const file = join(dir, 'rollout.jsonl');
    const lines = [
      {
        timestamp: '2026-06-10T08:00:00Z',
        payload: {
          role: 'user',
          content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/x</cwd>\n</environment_context>' }],
        },
      },
      {
        timestamp: '2026-06-10T08:00:01Z',
        payload: { role: 'user', content: [{ type: 'input_text', text: '真实提问' }] },
      },
      {
        timestamp: '2026-06-10T08:00:02Z',
        payload: {
          role: 'user',
          content: [{ type: 'input_text', text: '<turn_aborted>\nThe user interrupted.\n</turn_aborted>' }],
        },
      },
      {
        timestamp: '2026-06-10T08:00:03Z',
        payload: { role: 'assistant', content: [{ type: 'output_text', text: '<answer>带标签的回答保留</answer>' }] },
      },
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));

    const parsed = parseSessionFile('codex', file, 'sid-1');
    expect(parsed.map((m) => m.items[0].text)).toEqual(['真实提问', '<answer>带标签的回答保留</answer>']);
    expect(parsed.map((m) => m.msgId)).toEqual(['codex-sid-1-0', 'codex-sid-1-1']);
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

describe('inline image materialization (preview support)', () => {
  // 1x1 transparent PNG
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('decodes images into a content-addressed cache, idempotently', async () => {
    const { existsSync, readdirSync, rmSync } = await import('node:fs');
    const dir = '/tmp/ace-test-nonexistent/ace-cli-images/img-sess'; // under mocked getDataPath()
    rmSync(dir, { recursive: true, force: true });

    const first = materializeCliImages('img-sess', [{ mediaType: 'image/png', dataBase64: PNG_B64 }]);
    expect(first).toHaveLength(1);
    expect(first[0].startsWith(dir)).toBe(true);
    expect(first[0].endsWith('.png')).toBe(true);
    expect(existsSync(first[0])).toBe(true);

    const second = materializeCliImages('img-sess', [{ mediaType: 'image/png', dataBase64: PNG_B64 }]);
    expect(second).toEqual(first); // same content → same file, no duplicate
    expect(readdirSync(dir)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a session id that is not a plain token (path-segment safety)', () => {
    expect(materializeCliImages('../evil', [{ mediaType: 'image/png', dataBase64: PNG_B64 }])).toEqual([]);
    expect(materializeCliImages('a/b', [{ mediaType: 'image/png', dataBase64: PNG_B64 }])).toEqual([]);
  });

  it('withFilesMarker appends the app file-marker block (or nothing)', () => {
    expect(withFilesMarker('看这张图', ['/x/a.png'])).toBe('看这张图\n[[AION_FILES]]\n/x/a.png');
    expect(withFilesMarker('', ['/x/a.png', '/x/b.jpg'])).toBe('[[AION_FILES]]\n/x/a.png\n/x/b.jpg');
    expect(withFilesMarker('纯文本', [])).toBe('纯文本');
  });

  it('parses inline images from both CLI formats', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-img-'));

    const claudeFile = join(dir, 'c.jsonl');
    writeFileSync(
      claudeFile,
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-06-10T08:00:00Z',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: '[Image #1]\n这图哪里丑' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
          ],
        },
      })
    );
    const claude = parseSessionFile('claude-code', claudeFile, 'c');
    expect(claude[0].items).toEqual([
      { kind: 'text', text: '这图哪里丑' },
      { kind: 'image', mediaType: 'image/png', dataBase64: PNG_B64 },
    ]);

    const codexFile = join(dir, 'r.jsonl');
    writeFileSync(
      codexFile,
      JSON.stringify({
        timestamp: '2026-06-10T08:00:00Z',
        payload: {
          role: 'user',
          content: [
            { type: 'input_text', text: '<image name=[Image #1]>' },
            { type: 'input_image', image_url: `data:image/jpeg;base64,${PNG_B64}` },
            { type: 'input_text', text: '</image>' },
            { type: 'input_text', text: '看这张截图' },
          ],
        },
      })
    );
    const codex = parseSessionFile('codex', codexFile, 'sid-9');
    expect(codex[0].items).toEqual([
      { kind: 'image', mediaType: 'image/jpeg', dataBase64: PNG_B64 },
      { kind: 'text', text: '看这张截图' },
    ]);
  });
});

describe('tool-call extraction (compact "executed" rows)', () => {
  it('claude: pairs tool_use with its tool_result from the next record', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-tool-'));
    const file = join(dir, 's.jsonl');
    const lines = [
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-06-10T08:00:00Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '我看一下' },
            { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls -la' } },
            { type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: '/x/y.ts' } },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        timestamp: '2026-06-10T08:00:01Z',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'total 0' },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_2',
              content: [{ type: 'text', text: 'File not found' }],
              is_error: true,
            },
          ],
        },
      },
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));

    const parsed = parseSessionFile('claude-code', file, 's');
    expect(parsed).toHaveLength(1); // the tool_result-only user record emits nothing
    const [text, bash, read] = parsed[0].items;
    expect(text).toEqual({ kind: 'text', text: '我看一下' });
    expect(bash).toMatchObject({
      kind: 'tool',
      callId: 'toolu_1',
      name: 'Bash',
      title: 'Bash ls -la',
      toolKind: 'execute',
      status: 'completed',
      output: 'total 0',
    });
    expect(read).toMatchObject({
      kind: 'tool',
      callId: 'toolu_2',
      toolKind: 'read',
      status: 'failed',
      output: 'File not found',
    });
  });

  it('codex: pairs function_call with its output; non-zero exit code → failed', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-tool-'));
    const file = join(dir, 'r.jsonl');
    const lines = [
      {
        timestamp: '2026-06-10T08:00:00Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_1',
          arguments: JSON.stringify({ cmd: 'ls' }),
        },
      },
      {
        timestamp: '2026-06-10T08:00:01Z',
        payload: { type: 'function_call_output', call_id: 'call_1', output: 'Process exited with code 0\nOutput:\nok' },
      },
      {
        timestamp: '2026-06-10T08:00:02Z',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call_2',
          arguments: JSON.stringify({ cmd: 'rg nope' }),
        },
      },
      {
        timestamp: '2026-06-10T08:00:03Z',
        payload: { type: 'function_call_output', call_id: 'call_2', output: 'Process exited with code 1\nOutput:\n' },
      },
      {
        timestamp: '2026-06-10T08:00:04Z',
        payload: { role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
      },
    ];
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));

    const parsed = parseSessionFile('codex', file, 'sid');
    expect(parsed.map((m) => m.items[0].kind)).toEqual(['tool', 'tool', 'text']);
    expect(parsed[0].items[0]).toMatchObject({ callId: 'call_1', title: 'exec_command ls', status: 'completed' });
    expect(parsed[1].items[0]).toMatchObject({ callId: 'call_2', status: 'failed' });
    expect(parsed.map((m) => m.msgId)).toEqual(['codex-sid-0', 'codex-sid-1', 'codex-sid-2']);
  });

  it('toolCallContent mirrors the live acp_tool_call persisted shape', () => {
    const content = toolCallContent('claude-code', 'sess-1', {
      kind: 'tool',
      callId: 'toolu_9',
      name: 'Read',
      title: 'Read /x/y.ts',
      toolKind: 'read',
      status: 'completed',
      rawInput: { file_path: '/x/y.ts' },
      output: 'file body',
    });
    expect(content).toEqual({
      _meta: { claudeCode: { toolName: 'Read' } },
      session_id: 'sess-1',
      update: {
        tool_call_id: 'toolu_9',
        session_update: 'tool_call_update',
        status: 'completed',
        title: 'Read /x/y.ts',
        kind: 'read',
        raw_input: { file_path: '/x/y.ts' },
        raw_output: 'file body',
        content: [{ type: 'content', content: { type: 'text', text: 'file body' } }],
      },
    });
    // codex rows carry no claudeCode meta
    const codex = toolCallContent('codex', 's', {
      kind: 'tool',
      callId: 'c1',
      name: 'exec_command',
      title: 'exec_command ls',
      toolKind: 'execute',
      status: 'completed',
    });
    expect(codex).not.toHaveProperty('_meta');
    expect((codex.update as Record<string, unknown>).content).toEqual([]);
  });
});

describe('escapeFilesMarker (literal marker in chat text)', () => {
  it('breaks the token invisibly so MessageText never splits on it', () => {
    const escaped = escapeFilesMarker('正文提到 [[AION_FILES]] 标记\n[[AION_FILES]]\n/not/a/file.png');
    expect(escaped).not.toContain('[[AION_FILES]]');
    expect(escaped).toContain('[[AION_FILES\u200b]]');
    expect(escaped).toContain('/not/a/file.png'); // rest of the text untouched
    expect(escapeFilesMarker('普通文本')).toBe('普通文本');
  });
});

describe('gemini parsing (event-sourced jsonl, A1 dual-channel merge)', () => {
  const HEADER = {
    sessionId: 'aaaa1111-2222-3333-4444-555566667777',
    projectHash: 'x',
    startTime: '2026-06-10T08:00:00Z',
    lastUpdated: '2026-06-10T08:00:00Z',
    kind: 'main',
  };
  const SEED = {
    id: 'd04923d38bb0f6017037e74183378ef4',
    timestamp: '2026-06-10T08:00:00.100Z',
    type: 'user',
    content: [{ text: '<session_context>\nThis is the Gemini CLI…' }],
  };

  async function writeJsonl(name: string, lines: unknown[]): Promise<string> {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-gem-'));
    mkdirSync(join(dir, 'proj', 'chats'), { recursive: true });
    const file = join(dir, 'proj', 'chats', name);
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'));
    return file;
  }

  it('typed-only file: texts + tips out, seed and $set/header never rendered', async () => {
    const file = await writeJsonl('session-2026-06-10T08-00-aaaa1111.jsonl', [
      HEADER,
      { $set: { messages: [SEED], lastUpdated: '2026-06-10T08:00:00.100Z' } },
      { id: 'u1', timestamp: '2026-06-10T08:00:01Z', type: 'user', content: [{ text: '你好' }] },
      { $set: { lastUpdated: '2026-06-10T08:00:01Z' } },
      { id: 'e1', timestamp: '2026-06-10T08:00:02Z', type: 'error', content: '[API Error: oops]' },
      { id: 'i1', timestamp: '2026-06-10T08:00:03Z', type: 'info', content: 'Press F12 for diagnostics' },
      { id: 'w1', timestamp: '2026-06-10T08:00:04Z', type: 'warning', content: 'Hook failed' },
      { id: 'g1', timestamp: '2026-06-10T08:00:05Z', type: 'gemini', content: '你好！我是 Gemini CLI。' },
    ]);
    const parsed = parseSessionFile('gemini', file, HEADER.sessionId);
    expect(parsed.map((m) => m.items[0])).toEqual([
      { kind: 'text', text: '你好' },
      { kind: 'tip', tipType: 'error', text: '[API Error: oops]' },
      { kind: 'tip', tipType: 'info', text: 'Press F12 for diagnostics' },
      { kind: 'tip', tipType: 'warning', text: 'Hook failed' },
      { kind: 'text', text: '你好！我是 Gemini CLI。' },
    ]);
    expect(parsed[0].role).toBe('user');
    expect(parsed[4].role).toBe('assistant');
    expect(parsed[0].msgId).toBe('gem-u1');
  });

  it('🔴 A1 drift-insurance: a real message ONLY in $set.messages is recovered', async () => {
    // No real file looks like this today — this synthetic fixture is the A1
    // merge branch's only coverage (see plan ADR).
    const file = await writeJsonl('session-2026-06-10T08-00-aaaa1111.jsonl', [
      HEADER,
      {
        $set: {
          messages: [
            SEED,
            { id: 'snap1', timestamp: '2026-06-10T08:00:01Z', type: 'user', content: [{ text: '只在快照里的消息' }] },
          ],
        },
      },
      { id: 'g1', timestamp: '2026-06-10T08:00:02Z', type: 'gemini', content: '回复' },
    ]);
    const parsed = parseSessionFile('gemini', file, HEADER.sessionId);
    expect(parsed.map((m) => m.items[0].kind === 'text' && m.items[0].text)).toEqual(['只在快照里的消息', '回复']);
  });

  it('same record id in both channels → exactly one row (id dedup)', async () => {
    const shared = { id: 'dup1', timestamp: '2026-06-10T08:00:01Z', type: 'user', content: [{ text: '同一条' }] };
    const file = await writeJsonl('session-2026-06-10T08-00-aaaa1111.jsonl', [
      HEADER,
      { $set: { messages: [SEED, shared] } },
      shared,
    ]);
    const parsed = parseSessionFile('gemini', file, HEADER.sessionId);
    expect(parsed).toHaveLength(1);
  });

  it('empty aborted session (header + seed-only snapshot) → empty, no throw', async () => {
    const file = await writeJsonl('session-2026-06-10T08-00-aaaa1111.jsonl', [HEADER, { $set: { messages: [SEED] } }]);
    expect(parseSessionFile('gemini', file, HEADER.sessionId)).toEqual([]);
  });

  it('header-only / malformed file → empty, no throw', async () => {
    const file = await writeJsonl('session-2026-06-10T08-00-aaaa1111.jsonl', [HEADER]);
    expect(parseSessionFile('gemini', file, HEADER.sessionId)).toEqual([]);
  });

  it('continuation files merge: same sessionId across files, ordered, deduped', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'ace-gem-root-'));
    mkdirSync(join(root, 'proj', 'chats'), { recursive: true });
    const orig = join(root, 'proj', 'chats', 'session-2026-06-10T08-00-aaaa1111.jsonl');
    const cont = join(root, 'proj', 'chats', 'session-2026-06-11T09-00-aaaa1111.jsonl');
    writeFileSync(
      orig,
      [
        HEADER,
        { id: 'u1', timestamp: '2026-06-10T08:00:01Z', type: 'user', content: [{ text: '第一轮' }] },
        { id: 'g1', timestamp: '2026-06-10T08:00:02Z', type: 'gemini', content: '第一轮回复' },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n')
    );
    writeFileSync(
      cont,
      [
        { ...HEADER, startTime: '2026-06-11T09:00:00Z', lastUpdated: '2026-06-11T09:00:00Z' },
        { $set: { messages: [SEED] } },
        { id: 'u2', timestamp: '2026-06-11T09:00:01Z', type: 'user', content: [{ text: '续接轮' }] },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n')
    );
    // locator: both files found for the full sessionId, newest first
    const found = findGeminiFiles(HEADER.sessionId, root);
    expect(found).toHaveLength(2);
    const merged = parseSessionFiles('gemini', found, HEADER.sessionId);
    expect(merged.map((m) => m.items[0].kind === 'text' && m.items[0].text)).toEqual([
      '第一轮',
      '第一轮回复',
      '续接轮',
    ]);
  });

  it('locator skips an 8hex-prefix collision whose header does not full-match', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'ace-gem-col-'));
    mkdirSync(join(root, 'proj', 'chats'), { recursive: true });
    // Same first-8-hex in the FILENAME, different full sessionId in the header.
    writeFileSync(
      join(root, 'proj', 'chats', 'session-2026-06-10T07-00-aaaa1111.jsonl'),
      JSON.stringify({ ...HEADER, sessionId: 'aaaa1111-ffff-ffff-ffff-ffffffffffff' })
    );
    writeFileSync(join(root, 'proj', 'chats', 'session-2026-06-10T08-00-aaaa1111.jsonl'), JSON.stringify(HEADER));
    const found = findGeminiFiles(HEADER.sessionId, root);
    expect(found).toHaveLength(1);
    expect(found[0].endsWith('session-2026-06-10T08-00-aaaa1111.jsonl')).toBe(true);
  });
});

describe('gemini import scanner (projectHash workspace recovery)', () => {
  it('reverse-looks-up workspace via sha256(raw projects.json key) and skips the seed title', async () => {
    const { createHash } = await import('node:crypto');
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-gem-scan-'));
    const realPath = '/Users/x/proj-a';
    const projectsJson = join(dir, 'projects.json');
    // dirName collision on purpose: two real paths, same slug family
    writeFileSync(projectsJson, JSON.stringify({ projects: { [realPath]: 'proj-a', '/Users/y/proj-a': 'proj-a-1' } }));
    const hashMap = loadGeminiProjectHashMap(projectsJson);
    expect(hashMap.get(createHash('sha256').update(realPath).digest('hex'))).toBe(realPath);

    mkdirSync(join(dir, 'chats'), { recursive: true });
    const file = join(dir, 'chats', 'session-2026-06-10T08-00-bbbb2222.jsonl');
    writeFileSync(
      file,
      [
        {
          sessionId: 'bbbb2222-1111-2222-3333-444455556666',
          projectHash: createHash('sha256').update(realPath).digest('hex'),
          startTime: '2026-06-10T08:00:00Z',
          lastUpdated: '2026-06-10T08:00:00Z',
        },
        {
          $set: {
            messages: [
              {
                id: 'seed',
                timestamp: '2026-06-10T08:00:00.1Z',
                type: 'user',
                content: [{ text: '<session_context>\n…' }],
              },
            ],
          },
        },
        { id: 'u1', timestamp: '2026-06-10T08:00:01Z', type: 'user', content: [{ text: '真实标题来源' }] },
        { $set: { lastUpdated: '2026-06-10T09:30:00Z' } },
      ]
        .map((l) => JSON.stringify(l))
        .join('\n')
    );
    const meta = parseGeminiSessionFile(file, hashMap);
    expect(meta).toMatchObject({
      source: 'gemini',
      backend: 'gemini',
      sessionId: 'bbbb2222-1111-2222-3333-444455556666',
      workspace: realPath,
      title: '真实标题来源',
    });
    // event-sourced replay: updatedAt is the LAST $set.lastUpdated, not the header value
    expect(meta?.updatedAt).toBe(Date.parse('2026-06-10T09:30:00Z'));
  });

  it('unknown projectHash → workspace undefined (downstream resolveWorkspace fallback)', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ace-gem-scan2-'));
    mkdirSync(join(dir, 'chats'), { recursive: true });
    const file = join(dir, 'chats', 'session-2026-06-10T08-00-cccc3333.jsonl');
    writeFileSync(
      file,
      JSON.stringify({ sessionId: 'cccc3333-1-2-3-4', projectHash: 'deadbeef', startTime: '2026-06-10T08:00:00Z' })
    );
    const meta = parseGeminiSessionFile(file, new Map());
    expect(meta?.workspace).toBeUndefined();
    expect(meta?.sessionId).toBe('cccc3333-1-2-3-4');
  });
});

// --- opencode parser (pure core; the shared-DB shells never run under vitest) ---

import {
  cleanOpencodeTitle,
  isOpencodeInjectedText,
  mapOpencodeMessages,
  mapOpencodeSessionRow,
} from '@process/ace/parsers/opencodeParser';

describe('opencodeParser.cleanOpencodeTitle', () => {
  it('strips the markdown "# Conversation Title:" wrapper (real-data shape)', () => {
    expect(cleanOpencodeTitle('# Conversation Title: "Claude Code vs OpenCode"')).toBe('Claude Code vs OpenCode');
    expect(cleanOpencodeTitle('## Conversation Title: no quotes here')).toBe('no quotes here');
    // real-data: bold residue inside the wrapper ('**Problem Ticket Analytics…**')
    expect(cleanOpencodeTitle('# Conversation Title: "**Bold Title**"')).toBe('Bold Title');
  });

  it('keeps plain titles and trims; non-strings/empty become empty string', () => {
    expect(cleanOpencodeTitle('  zcf卸载方法问题 ')).toBe('zcf卸载方法问题');
    expect(cleanOpencodeTitle('# heading only')).toBe('heading only');
    expect(cleanOpencodeTitle(null)).toBe('');
    expect(cleanOpencodeTitle('   ')).toBe('');
  });
});

describe('opencodeParser.mapOpencodeSessionRow', () => {
  it('maps columns, rounds times (INTEGER discipline), falls back title→id', () => {
    const meta = mapOpencodeSessionRow({
      id: 'ses_16cddf242ffeTuUKGuQYpThw8a',
      directory: '/Users/x/proj',
      title: '# Conversation Title: "T"',
      time_created: 1780586871614.7, // a REAL here once 500'd the whole sidebar
      time_updated: 1780586871614.2,
    });
    expect(meta).toEqual({
      source: 'opencode',
      sessionId: 'ses_16cddf242ffeTuUKGuQYpThw8a',
      backend: 'opencode',
      title: 'T',
      workspace: '/Users/x/proj',
      createdAt: 1780586871615,
      updatedAt: 1780586871614,
    });
  });

  it('empty directory → undefined workspace; unusable title → session id', () => {
    const meta = mapOpencodeSessionRow({
      id: 'ses_abc12345678',
      directory: '',
      title: '   ',
      time_created: null,
      time_updated: null,
    });
    expect(meta.workspace).toBeUndefined();
    expect(meta.title).toBe('ses_abc12345678');
    expect(meta.createdAt).toBeUndefined();
  });
});

describe('opencodeParser.mapOpencodeMessages (all part types)', () => {
  const msg = (id: string, role: string, t = 1000) => ({ id, time_created: t, data: JSON.stringify({ role }) });
  const part = (id: string, message_id: string, data: object) => ({ id, message_id, data: JSON.stringify(data) });

  it('maps text/reasoning/tool/file parts onto existing ParsedCliItem variants', () => {
    const out = mapOpencodeMessages(
      [msg('msg_1', 'user'), msg('msg_2', 'assistant', 2000.6)],
      [
        part('prt_1', 'msg_1', { type: 'text', text: '帮我查一下' }),
        part('prt_2', 'msg_2', { type: 'reasoning', text: 'thinking…' }),
        part('prt_3', 'msg_2', {
          type: 'tool',
          tool: 'webfetch',
          callID: 'call_1',
          state: { status: 'completed', input: { url: 'https://x' }, output: 'page text' },
        }),
        part('prt_4', 'msg_2', {
          type: 'file',
          mime: 'image/png',
          url: 'data:image/png;base64,aGVsbG8=',
        }),
        part('prt_5', 'msg_2', { type: 'text', text: 'answer' }),
      ]
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ msgId: 'opencode-msg_1', role: 'user', createdAt: 1000 });
    expect(out[0].items).toEqual([{ kind: 'text', text: '帮我查一下' }]);
    expect(out[1].createdAt).toBe(2001); // rounded
    expect(out[1].items).toEqual([
      { kind: 'thinking', text: 'thinking…' },
      {
        kind: 'tool',
        callId: 'call_1',
        name: 'webfetch',
        title: 'webfetch https://x',
        toolKind: 'fetch',
        status: 'completed',
        rawInput: { url: 'https://x' },
        output: 'page text',
      },
      { kind: 'image', mediaType: 'image/png', dataBase64: 'aGVsbG8=' },
      { kind: 'text', text: 'answer' },
    ]);
  });

  it('filters synthetic-flagged text everywhere and [Assistant Rules] on USER records only', () => {
    const out = mapOpencodeMessages(
      [msg('msg_u', 'user'), msg('msg_a', 'assistant')],
      [
        part('prt_1', 'msg_u', { type: 'text', text: '[Assistant Rules]\n## Available Skills…' }),
        part('prt_2', 'msg_u', { type: 'text', text: 'real ask', synthetic: 1 }),
        part('prt_3', 'msg_u', { type: 'text', text: '真实问题' }),
        // assistants may legitimately QUOTE the marker — kept verbatim
        part('prt_4', 'msg_a', { type: 'text', text: '[Assistant Rules] is a harness wall' }),
      ]
    );
    expect(out[0].items).toEqual([{ kind: 'text', text: '真实问题' }]);
    expect(out[1].items).toEqual([{ kind: 'text', text: '[Assistant Rules] is a harness wall' }]);
    expect(isOpencodeInjectedText('  [Assistant Rules] x')).toBe(true);
    expect(isOpencodeInjectedText('normal')).toBe(false);
  });

  it('tool error state → failed; structural parts and unknown types are skipped', () => {
    const out = mapOpencodeMessages(
      [msg('msg_1', 'assistant')],
      [
        part('prt_0', 'msg_1', { type: 'step-start' }),
        part('prt_1', 'msg_1', {
          type: 'tool',
          tool: 'bash',
          callID: 'call_2',
          state: { status: 'error', input: { command: 'false' } },
        }),
        part('prt_2', 'msg_1', { type: 'step-finish' }),
        part('prt_3', 'msg_1', { type: 'patch' }),
        part('prt_4', 'msg_1', { type: 'snapshot' }),
        part('prt_5', 'msg_1', { type: 'totally-new-kind' }),
        part('prt_6', 'msg_1', { type: 'file', mime: 'application/pdf', url: 'data:application/pdf;base64,eA==' }),
      ]
    );
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual([
      expect.objectContaining({ kind: 'tool', name: 'bash', toolKind: 'execute', status: 'failed' }),
    ]);
  });

  it('tolerates malformed JSON and drops empty/non-chat messages', () => {
    const out = mapOpencodeMessages(
      [
        { id: 'msg_bad', time_created: 1, data: '{not json' },
        { id: 'msg_sys', time_created: 2, data: JSON.stringify({ role: 'system' }) },
        { id: 'msg_empty', time_created: 3, data: JSON.stringify({ role: 'user' }) },
        msg('msg_ok', 'user', 4),
      ],
      [
        { id: 'prt_bad', message_id: 'msg_ok', data: '{not json' },
        part('prt_ok', 'msg_ok', { type: 'text', text: 'hi' }),
      ]
    );
    expect(out).toHaveLength(1);
    expect(out[0].msgId).toBe('opencode-msg_ok');
  });
});
