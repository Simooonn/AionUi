/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useEffect, useState } from 'react';

/** Debounce window for post-turn refetches (turnCompleted can fire in bursts). */
const REFETCH_DEBOUNCE_MS = 500;

type AceCountApi = { messageCounts?: (ids: string[]) => Promise<Record<string, number>> };
const getAceApi = (): AceCountApi | undefined => (window as unknown as { electronAPI?: AceCountApi }).electronAPI;

/**
 * Authoritative message-row count for a conversation.
 *
 * The cursor-based messages HTTP API exposes no total, so the count comes from
 * the main process reading the aioncore DB directly (`ace:message-counts`) on
 * conversation open, then refetches (debounced) whenever the backend-agnostic
 * `turnCompleted` event fires for this conversation.
 *
 * Returns `undefined` while loading or when the fetch fails — the badge is a
 * best-effort decoration and callers should render nothing in that case.
 */
export const useConversationMessageCount = (conversation_id: string | undefined): number | undefined => {
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!conversation_id) {
      setCount(undefined);
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setCount(undefined);

    const fetchTotal = () => {
      const api = getAceApi();
      if (!api?.messageCounts) return;
      api
        .messageCounts([conversation_id])
        .then((counts) => {
          if (!disposed && typeof counts?.[conversation_id] === 'number') {
            setCount(counts[conversation_id]);
          }
        })
        .catch(() => {
          // Best-effort: keep the previous value (or undefined) on failure
        });
    };

    fetchTotal();
    const unsubscribe = ipcBridge.conversation.turnCompleted.on((event) => {
      if (event.session_id !== conversation_id) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(fetchTotal, REFETCH_DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [conversation_id]);

  return count;
};
