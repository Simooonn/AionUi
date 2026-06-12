/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useEffect, useState } from 'react';

/** Debounce window for post-turn refetches (turnCompleted can fire in bursts). */
const REFETCH_DEBOUNCE_MS = 500;

/**
 * Authoritative message-row count for a conversation.
 *
 * Reads `PaginatedResult.total` (DB row count) with a minimal `page_size: 1`
 * request on conversation open, then refetches (debounced) whenever the
 * backend-agnostic `turnCompleted` event fires for this conversation.
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
      ipcBridge.database.getConversationMessages
        .invoke({ conversation_id, page: 0, page_size: 1 })
        .then((result) => {
          if (!disposed && typeof result?.total === 'number') {
            setCount(result.total);
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
