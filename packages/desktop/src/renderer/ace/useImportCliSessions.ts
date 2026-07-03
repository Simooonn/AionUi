/**
 * Renderer hook that triggers the main-process CLI import over IPC.
 */

import { useCallback, useState } from 'react';
import type { ImportCliSessionsResult, ScanCliSessionsResult } from '@/common/ace/types';

type ElectronApi = {
  importCliSessions?: () => Promise<ImportCliSessionsResult>;
  scanCliSessions?: () => Promise<ScanCliSessionsResult | null>;
};

const EMPTY_UNAVAILABLE: ImportCliSessionsResult = {
  imported: 0,
  skipped: 0,
  failed: 0,
  errors: ['IPC unavailable'],
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
