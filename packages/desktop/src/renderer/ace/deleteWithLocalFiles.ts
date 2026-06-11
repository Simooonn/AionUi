/**
 * Renderer helper: delete conversations from the DB AND their local CLI session
 * files, in the correct order.
 *
 * Order (DB-first, see plan): resolve file paths while the rows still exist →
 * delete the DB rows (existing reliable channel) → unlink ONLY the files of
 * rows whose DB delete succeeded. Index alignment relies on Promise.all
 * preserving order: dbResults[i] ↔ ids[i] ↔ refs[ids[i]].
 */

type ResolvedFile = { path?: string; extraPaths?: string[]; imageCacheDir?: string };
type UnlinkResult = { deleted: boolean; reason?: string };
type AceApi = {
  resolveConversationFiles?: (ids: string[]) => Promise<Record<string, ResolvedFile>>;
  unlinkSessionFiles?: (paths: string[]) => Promise<Record<string, UnlinkResult>>;
};

function getApi(): AceApi | undefined {
  return (window as unknown as { electronAPI?: AceApi }).electronAPI;
}

/**
 * @param ids conversation ids to delete
 * @param deleteDb the existing per-id DB delete (returns true on success)
 * @returns dbResults (order-aligned with ids) and whether any local file delete failed
 */
export async function deleteConversationsWithFiles(
  ids: string[],
  deleteDb: (id: string) => Promise<boolean>
): Promise<{ dbResults: boolean[]; fileDeleteFailed: boolean }> {
  const api = getApi();

  // 1. Resolve paths BEFORE deleting DB rows (acp_session/extra vanish after).
  const refs: Record<string, ResolvedFile> = (await api?.resolveConversationFiles?.(ids).catch(() => ({}))) ?? {};

  // 2. Delete DB rows (existing channel). Promise.all preserves order.
  const dbResults = await Promise.all(ids.map((id) => deleteDb(id)));

  // 3. Unlink only files of DB-success ids (never iterate refs keys directly —
  //    that would lose the success filter and could delete files of failed rows).
  const paths = ids
    .filter((_, i) => dbResults[i] === true)
    .flatMap((id) =>
      [refs[id]?.path, ...(refs[id]?.extraPaths ?? []), refs[id]?.imageCacheDir].filter((p): p is string => Boolean(p))
    );

  let fileDeleteFailed = false;
  if (paths.length) {
    const res: Record<string, UnlinkResult> = (await api?.unlinkSessionFiles?.(paths).catch(() => ({}))) ?? {};
    fileDeleteFailed = Object.values(res).some((r) => r?.reason === 'delete-failed');
  }

  return { dbResults, fileDeleteFailed };
}
