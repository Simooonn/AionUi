/**
 * Renderer helper: delete conversations from the DB AND their local CLI session
 * data, in the correct order.
 *
 * Order (DB-first, see plan): resolve local data while the rows still exist →
 * delete the DB rows (existing reliable channel) → clean up ONLY the data of
 * rows whose DB delete succeeded. Index alignment relies on Promise.all
 * preserving order: dbResults[i] ↔ ids[i] ↔ refs[ids[i]].
 *
 * Two cleanup channels, routed by the ResolvedFile discriminant:
 * - 'file'      → unlinkSessionFiles (path-whitelisted filesystem unlink)
 * - 'opencode'  → deleteOpencodeSessions (controlled session-row delete in the
 *                 shared opencode.db — opencode has no per-session file, and
 *                 the union's 'opencode' arm carries no path by construction)
 * Image cache dirs ride the file channel for both kinds.
 */

import type { ResolvedFile, UnlinkResult } from '@/common/ace/types';

type AceApi = {
  resolveConversationFiles?: (ids: string[]) => Promise<Record<string, ResolvedFile>>;
  unlinkSessionFiles?: (paths: string[]) => Promise<Record<string, UnlinkResult>>;
  deleteOpencodeSessions?: (sessionIds: string[]) => Promise<Record<string, UnlinkResult>>;
};

function getApi(): AceApi | undefined {
  return (window as unknown as { electronAPI?: AceApi }).electronAPI;
}

function anyDeleteFailed(res: Record<string, UnlinkResult>): boolean {
  return Object.values(res).some((r) => r?.reason === 'delete-failed');
}

/**
 * @param ids conversation ids to delete
 * @param deleteDb the existing per-id DB delete (returns true on success)
 * @returns dbResults (order-aligned with ids) and whether any local cleanup failed
 */
export async function deleteConversationsWithFiles(
  ids: string[],
  deleteDb: (id: string) => Promise<boolean>
): Promise<{ dbResults: boolean[]; fileDeleteFailed: boolean }> {
  const api = getApi();

  // 1. Resolve local data BEFORE deleting DB rows (acp_session/extra vanish after).
  const refs: Record<string, ResolvedFile> = (await api?.resolveConversationFiles?.(ids).catch(() => ({}))) ?? {};

  // 2. Delete DB rows (existing channel). Promise.all preserves order.
  const dbResults = await Promise.all(ids.map((id) => deleteDb(id)));

  // 3. Clean up only the local data of DB-success ids (never iterate refs keys
  //    directly — that would lose the success filter and could delete data of
  //    failed rows).
  const okIds = ids.filter((_, i) => dbResults[i] === true);
  const paths: string[] = [];
  const opencodeIds: string[] = [];
  for (const id of okIds) {
    const r = refs[id];
    if (!r) continue;
    if (r.kind === 'opencode') {
      opencodeIds.push(r.opencodeSessionId);
      if (r.imageCacheDir) paths.push(r.imageCacheDir);
      continue;
    }
    for (const p of [r.path, ...(r.extraPaths ?? []), r.imageCacheDir]) {
      if (p) paths.push(p);
    }
  }

  let fileDeleteFailed = false;
  if (paths.length) {
    const res: Record<string, UnlinkResult> = (await api?.unlinkSessionFiles?.(paths).catch(() => ({}))) ?? {};
    fileDeleteFailed = anyDeleteFailed(res);
  }
  if (opencodeIds.length) {
    const res: Record<string, UnlinkResult> =
      (await api?.deleteOpencodeSessions?.(opencodeIds).catch(() => ({}))) ?? {};
    fileDeleteFailed = fileDeleteFailed || anyDeleteFailed(res);
  }

  return { dbResults, fileDeleteFailed };
}
