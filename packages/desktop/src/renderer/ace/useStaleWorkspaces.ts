/**
 * Returns the set of workspace paths whose directory no longer exists, for
 * graying out stale projects in the sidebar. Re-checks whenever the path list
 * changes (not polling); guards against a late IPC resolving after the list
 * already changed / the component unmounted.
 */

import { useCallback, useEffect, useState } from 'react';

type AceApi = { checkWorkspacesExist?: (paths: string[]) => Promise<Record<string, boolean>> };

function getApi(): AceApi | undefined {
  return (window as unknown as { electronAPI?: AceApi }).electronAPI;
}

export type StaleWorkspaces = {
  /** Workspace paths whose directory no longer exists. */
  stale: Set<string>;
  /** Force a re-check now (e.g. user clicked the refresh button) even when the
   * path set is unchanged — the directories may have changed on disk. */
  recheck: () => void;
  /** True while a check is in flight (drives the refresh button's spin/disable). */
  checking: boolean;
};

export function useStaleWorkspaces(workspaces: string[]): StaleWorkspaces {
  const [stale, setStale] = useState<Set<string>>(() => new Set());
  const [checking, setChecking] = useState(false);
  // Bumping this forces the effect to re-run on demand.
  const [nonce, setNonce] = useState(0);
  // Ignore refresh while a check is already running (prevents redundant IPC on
  // rapid clicks); the in-flight check already reflects the latest state.
  const recheck = useCallback(() => setNonce((n) => n + 1), []);
  // Stable dependency key so the effect re-runs when the path set changes.
  // NUL is the one character no filesystem permits in a path → safe delimiter.
  const key = workspaces.join('\0');

  useEffect(() => {
    let cancelled = false;
    const paths = key ? key.split('\0') : [];
    if (!paths.length) {
      setStale(new Set());
      return;
    }
    setChecking(true);
    void getApi()
      ?.checkWorkspacesExist?.(paths)
      .then((existMap) => {
        if (cancelled || !existMap) return;
        setStale(new Set(paths.filter((p) => existMap[p] === false)));
      })
      .catch(() => {
        /* best-effort: leave nothing grayed on failure */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  return { stale, recheck, checking };
}
