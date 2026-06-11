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
              { path: id === 'a' ? pathA : id === 'b' ? pathB : undefined, imageCacheDir: imageCacheDirs[id] },
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
        resolveConversationFiles: async () => ({ a: { path: orig, extraPaths: [cont] } }),
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
