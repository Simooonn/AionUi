/**
 * Renderer hook that triggers the main-process CLI import over IPC, plus the
 * pure helpers the settings button wires together (kept dependency-free so the
 * node test project can cover them without a DOM).
 */

import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';
import type { ImportCliSessionsResult, ScanCliSessionsResult } from '@/common/ace/types';

export type ScanAction = 'scan-failed' | 'import-direct' | 'confirm';

/**
 * null → the baseline was unavailable; 0 new → import directly (nothing to
 * confirm, but the duplicate cleanup still runs); >0 → ask first.
 */
export function resolveScanAction(scan: ScanCliSessionsResult | null): ScanAction {
  if (!scan) return 'scan-failed';
  return scan.total === 0 ? 'import-direct' : 'confirm';
}

export type ImportSummary = { level: 'success' | 'warning' | 'nothing'; text: string };

/** Toast text + level for an import result; items that are 0 are not shown. */
export function buildImportSummary(res: ImportCliSessionsResult, t: TFunction): ImportSummary {
  // `?? 0` keeps an old main process (without the cleanup fields) from rendering NaN.
  const removed = res.duplicatesRemoved ?? 0;
  const kept = res.duplicatesSkipped ?? 0;
  const errors = res.errors ?? [];
  if (res.imported === 0 && res.failed === 0 && removed === 0 && kept === 0 && errors.length === 0) {
    return { level: 'nothing', text: t('conversation.importCli.nothingNew') };
  }
  const parts: string[] = [
    t('conversation.importCli.summaryImported', { count: res.imported }),
    t('conversation.importCli.summarySkipped', { count: res.skipped }),
  ];
  if (res.failed > 0) parts.push(t('conversation.importCli.summaryFailed', { count: res.failed }));
  if (removed > 0) parts.push(t('conversation.importCli.duplicatesRemoved', { count: removed }));
  if (kept > 0) parts.push(t('conversation.importCli.duplicatesKept', { count: kept }));
  const text = t('conversation.importCli.done', { summary: parts.join(t('conversation.importCli.separator')) });
  return { level: res.failed > 0 || kept > 0 || errors.length > 0 ? 'warning' : 'success', text };
}

/**
 * Backend HTTP deletes never reach the Electron main process, so the renderer
 * must release what is bound to a removed conversation (PTYs, persisted command
 * queue) — same pattern as the sidebar / archived-page delete paths. Fire-and-
 * forget on `dispose`: an unsettled IPC must not block the list refresh.
 */
export function releaseRemovedConversations(
  ids: string[],
  deps: { emit: (id: string) => void; dispose: (id: string) => Promise<unknown> }
): void {
  for (const id of ids) {
    deps.emit(id);
    void deps.dispose(id).catch((): void => undefined);
  }
}

type ElectronApi = {
  importCliSessions?: () => Promise<ImportCliSessionsResult>;
  scanCliSessions?: () => Promise<ScanCliSessionsResult | null>;
};

const EMPTY_UNAVAILABLE: ImportCliSessionsResult = {
  imported: 0,
  skipped: 0,
  failed: 0,
  errors: ['IPC unavailable'],
  duplicatesRemoved: 0,
  duplicatesSkipped: 0,
  removedIds: [],
};

const getApi = (): ElectronApi | undefined => (window as unknown as { electronAPI?: ElectronApi }).electronAPI;

export function useImportCliSessions() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportCliSessionsResult | null>(null);

  /** Dry-run count of NEW sessions an import would create; null → scan failed. */
  const runScan = useCallback(async (): Promise<ScanCliSessionsResult | null> => {
    setLoading(true);
    try {
      return (await getApi()?.scanCliSessions?.()) ?? null;
    } finally {
      setLoading(false);
    }
  }, []);

  const runImport = useCallback(async (): Promise<ImportCliSessionsResult> => {
    setLoading(true);
    setResult(null);
    try {
      const res = (await getApi()?.importCliSessions?.()) ?? EMPTY_UNAVAILABLE;
      setResult(res);
      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, runScan, runImport };
}
