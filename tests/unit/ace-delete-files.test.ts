/**
 * Unit tests for the delete-conversation-files + gray-out feature (fork, ace/):
 * - sessionFiles.unlinkSessionFiles: path confinement + missing-file handling
 * - sessionFiles.checkWorkspacesExist: existence/dir/empty handling
 * - deleteWithLocalFiles: DB-first order-zip (only unlink DB-success ids' files)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@process/utils', () => ({ getDataPath: () => '/tmp/ace-test-nonexistent' }));

import { checkWorkspacesExist, unlinkSessionFiles } from '@process/ace/sessionFiles';
import { deleteConversationsWithFiles } from '@/renderer/ace/deleteWithLocalFiles';

describe('sessionFiles.unlinkSessionFiles (path confinement)', () => {
  it('refuses paths outside ~/.claude/projects and ~/.codex', async () => {
    const res = await unlinkSessionFiles([
      '/etc/passwd',
      '/tmp/whatever.jsonl',
      join(homedir(), 'Documents', 'x.jsonl'),
    ]);
    expect(res['/etc/passwd'].reason).toBe('out-of-scope');
    expect(res['/tmp/whatever.jsonl'].reason).toBe('out-of-scope');
    expect(res[join(homedir(), 'Documents', 'x.jsonl')].reason).toBe('out-of-scope');
  });

  it('reports no-file for an in-scope path that does not exist', async () => {
    const p = join(homedir(), '.claude', 'projects', 'nonexistent-proj', 'deadbeef-dead-dead-dead-deadbeefdead.jsonl');
    const res = await unlinkSessionFiles([p]);
    expect(res[p]).toEqual({ deleted: false, reason: 'no-file' });
  });

  it('rejects a `..` traversal that literally starts with an allowed root', async () => {
    // Passes a naive startsWith but normalizes to outside the CLI roots.
    const evil = join(homedir(), '.claude', 'projects') + '/../../../etc/hosts';
    const res = await unlinkSessionFiles([evil]);
    expect(res[evil]).toEqual({ deleted: false, reason: 'out-of-scope' });
  });

  it('gemini tmp root is in scope; traversal escapes from it are refused', async () => {
    const inScope = join(homedir(), '.gemini', 'tmp', 'proj', 'chats', 'session-2026-06-10T08-00-deadbeef.jsonl');
    const evil = join(homedir(), '.gemini', 'tmp') + '/../../../etc/hosts';
    const res = await unlinkSessionFiles([inScope, evil]);
    expect(res[inScope]).toEqual({ deleted: false, reason: 'no-file' }); // accepted by whitelist, file absent
    expect(res[evil]).toEqual({ deleted: false, reason: 'out-of-scope' });
  });

  it('recursively deletes an in-scope image-cache dir, refuses escapes from it', async () => {
    const { existsSync, mkdirSync } = await import('node:fs');
    const cacheDir = '/tmp/ace-test-nonexistent/ace-cli-images/sess-1'; // under mocked getDataPath()
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'img.png'), 'x');

    const evil = '/tmp/ace-test-nonexistent/ace-cli-images/../../../etc/hosts';
    const res = await unlinkSessionFiles([cacheDir, evil]);
    expect(res[cacheDir]).toEqual({ deleted: true });
    expect(existsSync(cacheDir)).toBe(false);
    expect(res[evil]).toEqual({ deleted: false, reason: 'out-of-scope' });
  });
});

describe('sessionFiles.checkWorkspacesExist', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('maps existing dir → true, missing → false, file → false, empty → false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ace-ws-'));
    made.push(dir);
    const file = join(dir, 'f.txt');
    writeFileSync(file, 'x');
    const missing = join(dir, 'nope');
    const res = checkWorkspacesExist([dir, file, missing, '']);
    expect(res[dir]).toBe(true);
    expect(res[file]).toBe(false); // exists but not a directory
    expect(res[missing]).toBe(false);
    expect(res['']).toBe(false);
  });
});

describe('deleteWithLocalFiles.deleteConversationsWithFiles (DB-first order-zip)', () => {
  const CLAUDE = join(homedir(), '.claude', 'projects');
  const pathA = join(CLAUDE, 'p', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl');
  const pathB = join(CLAUDE, 'p', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl');

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  function installApi(
    unlinkSpy: (paths: string[]) => Promise<Record<string, { deleted: boolean; reason?: string }>>,
    imageCacheDirs: Record<string, string> = {}
  ) {
    (globalThis as { window?: unknown }).window = {
      electronAPI: {
        resolveConversationFiles: async (ids: string[]) =>
          Object.fromEntries(
            ids.map((id) => [
              id,
              {
                kind: 'file',
                path: id === 'a' ? pathA : id === 'b' ? pathB : undefined,
                imageCacheDir: imageCacheDirs[id],
              },
            ])
          ),
        unlinkSessionFiles: unlinkSpy,
      },
    };
  }

  it('only unlinks files of ids whose DB delete succeeded', async () => {
    const unlinkSpy = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, { deleted: true }])));
    installApi(unlinkSpy);
    // 'a' DB-delete succeeds, 'b' fails → only pathA may be unlinked.
    const { dbResults, fileDeleteFailed } = await deleteConversationsWithFiles(['a', 'b'], (id) =>
      Promise.resolve(id === 'a')
    );
    expect(dbResults).toEqual([true, false]);
    expect(unlinkSpy).toHaveBeenCalledWith([pathA]);
    expect(fileDeleteFailed).toBe(false);
  });

  it('includes the image-cache dir of DB-success ids in the unlink batch', async () => {
    const unlinkSpy = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, { deleted: true }])));
    installApi(unlinkSpy, { a: '/data/ace-cli-images/sess-a', b: '/data/ace-cli-images/sess-b' });
    await deleteConversationsWithFiles(['a', 'b'], (id) => Promise.resolve(id === 'a'));
    // only id 'a' succeeded → its file AND cache dir, nothing of 'b'
    expect(unlinkSpy).toHaveBeenCalledWith([pathA, '/data/ace-cli-images/sess-a']);
  });

  it('propagates fileDeleteFailed when unlink reports delete-failed', async () => {
    const unlinkSpy = vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, { deleted: false, reason: 'delete-failed' }]))
    );
    installApi(unlinkSpy);
    const { fileDeleteFailed } = await deleteConversationsWithFiles(['a'], async () => true);
    expect(fileDeleteFailed).toBe(true);
  });

  it('skips unlink entirely when no DB delete succeeded', async () => {
    const unlinkSpy = vi.fn(async () => ({}));
    installApi(unlinkSpy);
    const { fileDeleteFailed } = await deleteConversationsWithFiles(['a', 'b'], async () => false);
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(fileDeleteFailed).toBe(false);
  });
});

describe('gemini multi-file delete + symlink refusal', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('extraPaths (continuation files) of DB-success ids reach the unlink batch', async () => {
    const CLAUDE = join(homedir(), '.gemini', 'tmp', 'proj', 'chats');
    const orig = join(CLAUDE, 'session-2026-06-10T08-00-aaaa1111.jsonl');
    const cont = join(CLAUDE, 'session-2026-06-11T09-00-aaaa1111.jsonl');
    const unlinkSpy = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, { deleted: true }])));
    (globalThis as { window?: unknown }).window = {
      electronAPI: {
        resolveConversationFiles: async () => ({ a: { kind: 'file', path: orig, extraPaths: [cont] } }),
        unlinkSessionFiles: unlinkSpy,
      },
    };
    await deleteConversationsWithFiles(['a'], async () => true);
    expect(unlinkSpy).toHaveBeenCalledWith([orig, cont]);
  });

  it('refuses to delete a symlink even when its path is inside a whitelisted root', async () => {
    const { mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { mkdtempSync } = await import('node:fs');
    // whitelisted root = mocked getDataPath()/ace-cli-images
    const cacheRoot = '/tmp/ace-test-nonexistent/ace-cli-images/sess-link';
    mkdirSync(cacheRoot, { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), 'ace-symlink-target-'));
    const target = join(outside, 'victim.txt');
    writeFileSync(target, 'precious');
    const link = join(cacheRoot, 'evil-link');
    symlinkSync(target, link);

    const res = await unlinkSessionFiles([link]);
    expect(res[link]).toEqual({ deleted: false, reason: 'out-of-scope' });
    expect(existsSync(target)).toBe(true); // symlink target untouched
    rmSync(cacheRoot, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
});

// --- opencode delete channel (shared-DB rows, controlled delete) ---------------

import { DatabaseSync } from 'node:sqlite';
import {
  deleteOpencodeSessionRows,
  isOpencodeSessionId,
  resolveSessionFilePath,
  type OpencodeDeleteDb,
} from '@process/ace/sessionFiles';
import { opencodeDbPath } from '@process/ace/parsers/opencodeParser';

const SES_A = 'ses_aaaaaaaa1111111111111111aa';
const SES_B = 'ses_bbbbbbbb2222222222222222bb';

describe('opencode id shape gate', () => {
  it('accepts real ses_ ids, rejects bare prefix/short/foreign shapes', () => {
    expect(isOpencodeSessionId('ses_16cddf242ffeTuUKGuQYpThw8a')).toBe(true);
    expect(isOpencodeSessionId('ses_')).toBe(false);
    expect(isOpencodeSessionId('ses_abc')).toBe(false); // < 8 chars after prefix
    expect(isOpencodeSessionId('deadbeef-dead-dead-dead-deadbeefdead')).toBe(false);
    expect(isOpencodeSessionId(undefined)).toBe(false);
  });

  it('existing hex validation is untouched: hex ids still resolve, ses_ ids never hit file locators', () => {
    // (covered structurally: resolveSessionFilePath dispatches per source — see 🔴 tests below)
    expect(isOpencodeSessionId('abcdef12')).toBe(false);
  });
});

describe('🔴 whole-DB-deletion regression guards', () => {
  it('unlinkSessionFiles REFUSES the opencode.db path (whitelist must never include it)', async () => {
    const dbPath = opencodeDbPath();
    const res = await unlinkSessionFiles([dbPath]);
    expect(res[dbPath]).toEqual({ deleted: false, reason: 'out-of-scope' });
  });

  function backendDbWith(extra: object, acpSessionId?: string): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, extra TEXT)');
    db.exec('CREATE TABLE acp_session (conversation_id TEXT, session_id TEXT)');
    db.prepare('INSERT INTO conversations VALUES (?, ?)').run('conv1', JSON.stringify(extra));
    if (acpSessionId) db.prepare('INSERT INTO acp_session VALUES (?, ?)').run('conv1', acpSessionId);
    return db;
  }

  it('IMPORTED opencode conversation resolves to a descriptor with NO path', () => {
    const db = backendDbWith({ cli_session_id: SES_A, cli_source: 'opencode', backend: 'opencode' });
    const r = resolveSessionFilePath(db as never, 'conv1');
    expect(r.kind).toBe('opencode');
    expect(r).not.toHaveProperty('path');
    expect(r.kind === 'opencode' && r.opencodeSessionId).toBe(SES_A);
  });

  it('APP-CREATED opencode conversation (acp_session route) also resolves to the descriptor', () => {
    const db = backendDbWith({ backend: 'opencode' }, SES_B);
    const r = resolveSessionFilePath(db as never, 'conv1');
    expect(r.kind).toBe('opencode');
    expect(r).not.toHaveProperty('path');
    expect(r.kind === 'opencode' && r.opencodeSessionId).toBe(SES_B);
  });
});

describe('deleteOpencodeSessionRows (FK-cascade controlled delete)', () => {
  /** Schema subset mirroring opencode.db's verified CASCADE topology. */
  function opencodeDbFixture(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE session (id TEXT PRIMARY KEY);
      CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES session(id) ON DELETE CASCADE);
      CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE);
    `);
    for (const [ses, msg, prt] of [
      [SES_A, 'msg_a', 'prt_a'],
      [SES_B, 'msg_b', 'prt_b'],
    ]) {
      db.prepare('INSERT INTO session VALUES (?)').run(ses);
      db.prepare('INSERT INTO message VALUES (?, ?)').run(msg, ses);
      db.prepare('INSERT INTO part VALUES (?, ?)').run(prt, msg);
    }
    return db;
  }
  const count = (db: DatabaseSync, sql: string) => Number((db.prepare(sql).get() as { c: number }).c);

  it('deletes one session with transitive cascade; sibling sessions stay intact', () => {
    const db = opencodeDbFixture();
    const res = deleteOpencodeSessionRows(db as unknown as OpencodeDeleteDb, [SES_A]);
    expect(res[SES_A]).toEqual({ deleted: true });
    expect(count(db, 'SELECT COUNT(*) c FROM session')).toBe(1);
    expect(count(db, `SELECT COUNT(*) c FROM message WHERE session_id = '${SES_A}'`)).toBe(0);
    expect(count(db, "SELECT COUNT(*) c FROM part WHERE message_id = 'msg_a'")).toBe(0);
    // sibling untouched, cascade did not over-reach
    expect(count(db, `SELECT COUNT(*) c FROM message WHERE session_id = '${SES_B}'`)).toBe(1);
    expect(count(db, "SELECT COUNT(*) c FROM part WHERE message_id = 'msg_b'")).toBe(1);
  });

  it('rejects malformed ids (out-of-scope) and reports missing rows as no-file', () => {
    const db = opencodeDbFixture();
    const res = deleteOpencodeSessionRows(db as unknown as OpencodeDeleteDb, [
      '../../etc/passwd',
      'ses_missing999999999999999999',
    ]);
    expect(res['../../etc/passwd']).toEqual({ deleted: false, reason: 'out-of-scope' });
    expect(res['ses_missing999999999999999999']).toEqual({ deleted: false, reason: 'no-file' });
    expect(count(db, 'SELECT COUNT(*) c FROM session')).toBe(2);
  });

  it('refuses every delete when the foreign_keys pragma cannot be asserted ON (orphan guard)', () => {
    const stub: OpencodeDeleteDb = {
      exec() {
        throw new Error('pragma unavailable');
      },
      prepare() {
        throw new Error('must not prepare when fk is off');
      },
    };
    const res = deleteOpencodeSessionRows(stub, [SES_A]);
    expect(res[SES_A]).toEqual({ deleted: false, reason: 'delete-failed' });
  });
});

describe('mixed-batch order-zip routing (file + opencode descriptors)', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('routes opencode descriptors to the DB channel, files to unlink; image caches ride the file channel', async () => {
    const CLAUDE = join(homedir(), '.claude', 'projects');
    const filePath = join(CLAUDE, 'p', 'cccccccc-cccc-cccc-cccc-cccccccccccc.jsonl');
    const unlinkSpy = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, { deleted: true }])));
    const opencodeSpy = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((i) => [i, { deleted: true }])));
    (globalThis as { window?: unknown }).window = {
      electronAPI: {
        resolveConversationFiles: async () => ({
          a: { kind: 'file', path: filePath },
          b: { kind: 'opencode', opencodeSessionId: SES_A, imageCacheDir: '/data/ace-cli-images/ses-x' },
          c: { kind: 'opencode', opencodeSessionId: SES_B },
        }),
        unlinkSessionFiles: unlinkSpy,
        deleteOpencodeSessions: opencodeSpy,
      },
    };
    // 'c' DB-delete fails → its opencode row must NOT be deleted.
    const { dbResults, fileDeleteFailed } = await deleteConversationsWithFiles(
      ['a', 'b', 'c'],
      async (id) => id !== 'c'
    );
    expect(dbResults).toEqual([true, true, false]);
    expect(unlinkSpy).toHaveBeenCalledWith([filePath, '/data/ace-cli-images/ses-x']);
    expect(opencodeSpy).toHaveBeenCalledWith([SES_A]);
    expect(fileDeleteFailed).toBe(false);
  });

  it('propagates fileDeleteFailed from the opencode channel', async () => {
    (globalThis as { window?: unknown }).window = {
      electronAPI: {
        resolveConversationFiles: async () => ({ a: { kind: 'opencode', opencodeSessionId: SES_A } }),
        unlinkSessionFiles: vi.fn(async () => ({})),
        deleteOpencodeSessions: async () => ({ [SES_A]: { deleted: false, reason: 'delete-failed' } }),
      },
    };
    const { fileDeleteFailed } = await deleteConversationsWithFiles(['a'], async () => true);
    expect(fileDeleteFailed).toBe(true);
  });
});
