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
import type { CliSource } from '@/common/ace/types';
import { hasCoupledSchema } from './aioncoreSchema';
import { cliImageCacheDir } from './messageImporter';
import { findSessionFiles } from './messageParser';

const BACKEND_DB = 'aionui-backend.db';
const HOME_ROOT = homedir();
const CLAUDE_PROJECTS_ROOT = join(HOME_ROOT, '.claude', 'projects');
const CODEX_ROOT = join(HOME_ROOT, '.codex');
const GEMINI_TMP_ROOT = join(HOME_ROOT, '.gemini', 'tmp');

type Db = import('better-sqlite3').Database;

export type ResolvedFile = {
  path?: string;
  /** Further files of the SAME session (gemini ACP resume continues a session
   * in new files sharing one sessionId — all must be deleted together). */
  extraPaths?: string[];
  /** App-owned cache of the session's materialized inline images (a directory). */
  imageCacheDir?: string;
};
export type UnlinkResult = { deleted: boolean; reason?: 'no-file' | 'out-of-scope' | 'delete-failed' };

/**
 * Reject empty/short session ids before they reach findSessionFile. The codex
 * locator uses a substring match (`name.includes(sid)`), so a blank id would
 * match the first rollout walked and delete an unrelated session.
 */
function isResolvableSessionId(sid: unknown): sid is string {
  // Require a leading hex run so a value like "rollout-" (which the codex
  // substring locator would match against every rollout) is rejected.
  return typeof sid === 'string' && /^[0-9a-fA-F]{8,}(-[0-9a-fA-F]+)*$/.test(sid.trim());
}

/** Resolve a conversation to its on-disk CLI session file (imported or app-created). */
function resolveSessionFilePath(db: Db, conversationId: string): ResolvedFile {
  const conv = db.prepare('SELECT extra FROM conversations WHERE id = ?').get(conversationId) as
    | { extra?: string }
    | undefined;
  if (!conv) return {};

  let extra: { cli_session_id?: string; cli_source?: CliSource; backend?: string } = {};
  try {
    extra = JSON.parse(conv.extra ?? '{}') as typeof extra;
  } catch {
    return {};
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
      source = extra.backend === 'codex' ? 'codex' : 'claude-code';
      sessionId = row.session_id;
    }
  }

  if (!source || !isResolvableSessionId(sessionId)) return {};
  const cacheDir = cliImageCacheDir(sessionId);
  const files = findSessionFiles(source, sessionId);
  return {
    path: files[0],
    extraPaths: files.length > 1 ? files.slice(1) : undefined,
    imageCacheDir: existsSync(cacheDir) ? cacheDir : undefined,
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
