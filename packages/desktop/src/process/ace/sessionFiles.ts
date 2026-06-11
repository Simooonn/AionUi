/**
 * Local CLI session-file operations for the delete-conversation / delete-project
 * feature, plus workspace existence checks for sidebar gray-out.
 *
 * Discipline (see plan delete-and-gray-projects.md):
 * - DB-first ordering: callers resolve file paths BEFORE deleting the DB rows
 *   (acp_session/extra vanish after delete), then unlink only on DB success.
 * - unlinkSessionFiles deletes only paths confined to ~/.claude/projects,
 *   ~/.codex, ~/.gemini/tmp or the app's image cache — a renderer-supplied
 *   path outside those roots (or any symlink) is refused, so the IPC can
 *   never become a delete-anything primitive.
 * - aioncore is NOT involved; deletions are plain Node fs in the main process.
 */

import { existsSync, lstatSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { getDataPath } from '@process/utils';
import type { CliSource, ResolvedFile, UnlinkResult } from '@/common/ace/types';
import { hasCoupledSchema } from './aioncoreSchema';
import { cliImageCacheDir } from './messageImporter';
import { findSessionFiles } from './messageParser';
import { opencodeDbPath } from './parsers/opencodeParser';

const BACKEND_DB = 'aionui-backend.db';
const HOME_ROOT = homedir();
const CLAUDE_PROJECTS_ROOT = join(HOME_ROOT, '.claude', 'projects');
const CODEX_ROOT = join(HOME_ROOT, '.codex');
const GEMINI_TMP_ROOT = join(HOME_ROOT, '.gemini', 'tmp');

type Db = import('better-sqlite3').Database;

export type { ResolvedFile, UnlinkResult };

/** opencode session ids: 'ses_' + alnum run (verified on all real ids: 26 chars, len 30). */
export function isOpencodeSessionId(sid: unknown): sid is string {
  return typeof sid === 'string' && /^ses_[A-Za-z0-9]{8,}$/.test(sid.trim());
}

/**
 * Reject empty/short session ids before they reach findSessionFile. The codex
 * locator uses a substring match (`name.includes(sid)`), so a blank id would
 * match the first rollout walked and delete an unrelated session.
 */
function isResolvableSessionId(source: CliSource, sid: unknown): sid is string {
  if (source === 'opencode') return isOpencodeSessionId(sid);
  // File-based CLIs: require a leading hex run so a value like "rollout-"
  // (which the codex substring locator would match against every rollout) is
  // rejected.
  return typeof sid === 'string' && /^[0-9a-fA-F]{8,}(-[0-9a-fA-F]+)*$/.test(sid.trim());
}

/** Map an app-created conversation's extra.backend to its CLI source. */
function sourceFromBackend(backend: string | undefined): CliSource {
  if (backend === 'codex') return 'codex';
  if (backend === 'gemini') return 'gemini';
  if (backend === 'opencode') return 'opencode';
  return 'claude-code';
}

/**
 * Resolve a conversation to its local CLI session data (imported or app-created).
 * opencode conversations resolve to a { kind: 'opencode' } DESCRIPTOR, never a
 * path: their "session file" is the shared opencode.db, and this function's
 * `path` flows straight into unlinkSessionFiles. The opencode branch therefore
 * MUST NOT call findSessionFiles (🔴 regression-tested).
 */
export function resolveSessionFilePath(db: Db, conversationId: string): ResolvedFile {
  const conv = db.prepare('SELECT extra FROM conversations WHERE id = ?').get(conversationId) as
    | { extra?: string }
    | undefined;
  if (!conv) return { kind: 'file' };

  let extra: { cli_session_id?: string; cli_source?: CliSource; backend?: string } = {};
  try {
    extra = JSON.parse(conv.extra ?? '{}') as typeof extra;
  } catch {
    return { kind: 'file' };
  }

  let source: CliSource | undefined;
  let sessionId: string | undefined;
  if (extra.cli_session_id && extra.cli_source) {
    // Imported conversation.
    source = extra.cli_source;
    sessionId = extra.cli_session_id;
  } else {
    // App-created conversation: locate via its acp_session row.
    const row = db.prepare('SELECT session_id FROM acp_session WHERE conversation_id = ?').get(conversationId) as
      | { session_id?: string | null }
      | undefined;
    if (row?.session_id) {
      source = sourceFromBackend(extra.backend);
      sessionId = row.session_id;
    }
  }

  if (!source || !isResolvableSessionId(source, sessionId)) return { kind: 'file' };
  const cacheDir = cliImageCacheDir(sessionId);
  const imageCacheDir = existsSync(cacheDir) ? cacheDir : undefined;
  if (source === 'opencode') {
    return { kind: 'opencode', opencodeSessionId: sessionId, imageCacheDir };
  }
  const files = findSessionFiles(source, sessionId);
  return {
    kind: 'file',
    path: files[0],
    extraPaths: files.length > 1 ? files.slice(1) : undefined,
    imageCacheDir,
  };
}

/**
 * Resolve the on-disk file path for each conversation id (no deletion). Opens
 * the DB once. Must be called BEFORE the DB rows are deleted.
 */
export async function resolveConversationFiles(ids: string[]): Promise<Record<string, ResolvedFile>> {
  const out: Record<string, ResolvedFile> = {};
  if (!ids.length) return out;
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const db: Db = new BetterSqlite3(join(getDataPath(), BACKEND_DB));
  try {
    db.pragma('busy_timeout = 5000');
    if (!hasCoupledSchema(db, 'conversations') || !hasCoupledSchema(db, 'acp_session')) return out;
    for (const id of ids) {
      out[id] = resolveSessionFilePath(db, id);
    }
    return out;
  } catch {
    return out;
  } finally {
    db.close();
  }
}

// MUST normalize before the prefix check: a raw startsWith passes on
// `<root>/../../etc/x` (literal prefix matches) while the kernel resolves the
// `..` segments to somewhere else entirely at syscall time.
function isInScope(normalizedPath: string): boolean {
  return (
    normalizedPath.startsWith(CLAUDE_PROJECTS_ROOT + sep) ||
    normalizedPath.startsWith(CODEX_ROOT + sep) ||
    normalizedPath.startsWith(GEMINI_TMP_ROOT + sep) ||
    // App-owned per-session image cache (a directory, removed recursively).
    normalizedPath.startsWith(join(getDataPath(), 'ace-cli-images') + sep)
  );
}

/**
 * Delete the given on-disk session files. Pure filesystem (no DB). Refuses any
 * path that does not normalize to inside the CLI session roots, so the renderer
 * (even if compromised) cannot turn this into a delete-anything primitive.
 */
export async function unlinkSessionFiles(paths: string[]): Promise<Record<string, UnlinkResult>> {
  const out: Record<string, UnlinkResult> = {};
  for (const raw of paths) {
    if (typeof raw !== 'string' || !raw) {
      out[String(raw)] = { deleted: false, reason: 'out-of-scope' };
      continue;
    }
    const p = normalize(raw);
    if (!isInScope(p)) {
      out[raw] = { deleted: false, reason: 'out-of-scope' };
      continue;
    }
    if (!existsSync(p)) {
      out[raw] = { deleted: false, reason: 'no-file' };
      continue;
    }
    try {
      // lstat (not stat): a planted symlink inside a whitelisted root would
      // pass the string-prefix check while rmSync follows it to an arbitrary
      // target — refuse symlinks outright.
      const st = lstatSync(p);
      if (st.isSymbolicLink()) {
        out[raw] = { deleted: false, reason: 'out-of-scope' };
        continue;
      }
      // Normalized path, never the raw renderer string. recursive is needed for
      // image-cache directories and is a no-op difference for plain files.
      rmSync(p, { recursive: st.isDirectory() });
      out[raw] = { deleted: true };
    } catch (e) {
      console.warn('[ace:sessionFiles] unlink failed:', e instanceof Error ? e.message : String(e));
      out[raw] = { deleted: false, reason: 'delete-failed' };
    }
  }
  return out;
}

// --- opencode controlled DB-delete channel ------------------------------------
// opencode sessions are rows in ONE shared SQLite DB — there is no per-session
// file to unlink. The ONLY write this fork ever performs on opencode.db is the
// session-row DELETE below: db path hardcoded (never caller-supplied), id shape
// validated, FK cascade asserted ON. The unlink whitelist above deliberately
// does NOT include the opencode data dir, so even a leaked path cannot become
// a whole-DB deletion.

/** Minimal sqlite surface shared by better-sqlite3 and node:sqlite (tests). */
export type OpencodeDeleteDb = {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number | bigint };
    get(...args: unknown[]): unknown;
  };
};

/**
 * Pure core: delete session rows by id with FK cascade. Referential cleanup is
 * driven by opencode's OWN schema declarations (message/session_message/
 * session_input/session_share/session_context_epoch/todo cascade directly,
 * part cascades via message — verified with PRAGMA foreign_key_list), so the
 * connection-level pragma MUST be on; if it cannot be asserted, every delete is
 * refused (fail-loud beats silent orphan rows).
 *
 * Batch semantics are per-id autocommit: a busy failure on one id never rolls
 * back earlier ids — same best-effort contract as unlinkSessionFiles.
 * Child sessions (parent_id) deliberately do NOT cascade (no FK upstream):
 * every session is its own conversation, deletion follows each conversation.
 */
export function deleteOpencodeSessionRows(db: OpencodeDeleteDb, sessionIds: string[]): Record<string, UnlinkResult> {
  const out: Record<string, UnlinkResult> = {};
  let fkOn = false;
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number | bigint } | undefined;
    fkOn = Number(row?.foreign_keys) === 1;
  } catch {
    fkOn = false;
  }
  for (const raw of sessionIds) {
    // Validate and USE the same normalized value (validate-vs-use divergence
    // would make a padded id pass the gate yet match no row).
    const id = typeof raw === 'string' ? raw.trim() : raw;
    if (!isOpencodeSessionId(id)) {
      out[String(raw)] = { deleted: false, reason: 'out-of-scope' };
      continue;
    }
    if (!fkOn) {
      // Without cascade a bare DELETE would orphan message/part rows.
      out[id] = { deleted: false, reason: 'delete-failed' };
      continue;
    }
    try {
      const info = db.prepare('DELETE FROM session WHERE id = ?').run(id);
      out[id] = Number(info.changes) > 0 ? { deleted: true } : { deleted: false, reason: 'no-file' };
    } catch (e) {
      console.warn('[ace:sessionFiles] opencode delete failed:', e instanceof Error ? e.message : String(e));
      out[id] = { deleted: false, reason: 'delete-failed' };
    }
  }
  return out;
}

/** Shell: open opencode.db read-write (busy-tolerant) and run the controlled delete. */
export async function deleteOpencodeSessions(sessionIds: string[]): Promise<Record<string, UnlinkResult>> {
  const out: Record<string, UnlinkResult> = {};
  if (!Array.isArray(sessionIds) || !sessionIds.length) return out;
  const dbPath = opencodeDbPath();
  if (!existsSync(dbPath)) {
    for (const id of sessionIds) out[String(id)] = { deleted: false, reason: 'no-file' };
    return out;
  }
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const db = new BetterSqlite3(dbPath);
  try {
    db.pragma('busy_timeout = 5000');
    return deleteOpencodeSessionRows(db as unknown as OpencodeDeleteDb, sessionIds);
  } catch (e) {
    // Write channel into a shared third-party DB — keep the failure observable.
    // The pure core never throws mid-batch (it catches per id), so this catch
    // only fires on open/pragma failure → the whole batch failed.
    console.warn('[ace:sessionFiles] opencode db open/delete failed:', e instanceof Error ? e.message : String(e));
    for (const id of sessionIds) out[String(id)] = { deleted: false, reason: 'delete-failed' };
    return out;
  } finally {
    db.close();
  }
}

/**
 * Existence map for workspace directories (sidebar gray-out). Read-only
 * existence/stat is intentionally NOT path-confined: workspaces are arbitrary
 * user-picked directories (incl. external volumes), and the renderer already
 * has broader fs read/browse via the existing `/api/fs/*` IPC, so this adds no
 * new capability.
 */
export function checkWorkspacesExist(paths: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of new Set(paths)) {
    if (typeof p !== 'string' || !p) {
      out[p] = false;
      continue;
    }
    try {
      out[p] = existsSync(p) && statSync(p).isDirectory();
    } catch {
      out[p] = false;
    }
  }
  return out;
}
