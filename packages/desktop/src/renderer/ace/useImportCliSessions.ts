/**
 * Renderer hook that triggers the main-process CLI import over IPC.
 */

import { useCallback, useState } from 'react';
import type { ImportCliSessionsResult } from '@/common/ace/types';

type ElectronApi = { importCliSessions?: () => Promise<ImportCliSessionsResult> };

const EMPTY_UNAVAILABLE: ImportCliSessionsResult = {
  imported: 0,
  skipped: 0,
  failed: 0,
  errors: ['IPC unavailable'],
};

export function useImportCliSessions() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportCliSessionsResult | null>(null);

  const runImport = useCallback(async (): Promise<ImportCliSessionsResult> => {
    setLoading(true);
    setResult(null);
    try {
      const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI;
      const res = (await api?.importCliSessions?.()) ?? EMPTY_UNAVAILABLE;
      setResult(res);
      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, runImport };
}
