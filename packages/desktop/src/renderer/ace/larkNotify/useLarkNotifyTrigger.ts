/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * App-level trigger for Lark group notifications.
 *
 * Subscribes to `turnCompleted`, keeps its own per-session terminal-state
 * registry (the sidebar sync hook's Sets cannot express the four display
 * tiers), and opens a fixed 60s debounce window on qualifying states.
 * At expiry it re-reads the (masked) config — so settings changes apply on
 * the very next window — assembles the snapshot, and skips sending entirely
 * when the list is empty. All failures degrade silently.
 */

import { ipcBridge } from '@/common';
import type { AceLarkNotifyMaskedConfig, LarkNotifyRow } from '@/common/ace/types';
import { LARK_NOTIFY_DEBOUNCE_MS, LARK_NOTIFY_TRIGGER_STATES, normalizeTerminalState } from '@/common/ace/larkNotify';
import { useEffect, useRef } from 'react';
import { assembleSnapshot } from './assembleSnapshot';
import { LarkNotifyWindowController } from './windowController';

type LarkNotifyApi = {
  larkNotifyGetConfig?: () => Promise<AceLarkNotifyMaskedConfig>;
  larkNotifySend?: (rows: LarkNotifyRow[]) => Promise<{ ok: boolean; reason?: string }>;
};

const getApi = (): LarkNotifyApi | undefined => (window as { electronAPI?: LarkNotifyApi }).electronAPI;

const fireNotification = async (terminalStates: ReadonlyMap<string, string>): Promise<void> => {
  const api = getApi();
  if (!api?.larkNotifyGetConfig || !api.larkNotifySend) return;
  try {
    const config = await api.larkNotifyGetConfig();
    if (!config?.enabled || !config.app_id || !config.has_secret || !config.chat_id) return;
    const rows = await assembleSnapshot(terminalStates);
    if (!rows.length) return;
    await api.larkNotifySend(rows);
  } catch (e) {
    console.warn('[larkNotify] notification failed:', e instanceof Error ? e.message : e);
  }
};

export const useLarkNotifyTrigger = (): void => {
  const terminalStatesRef = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new LarkNotifyWindowController(LARK_NOTIFY_DEBOUNCE_MS, () => {
      void fireNotification(terminalStatesRef.current);
    });
    const unsubscribe = ipcBridge.conversation.turnCompleted.on((event) => {
      const normalized = normalizeTerminalState(event.state, event.runtime?.pending_confirmations ?? 0);
      terminalStatesRef.current.set(event.session_id, normalized);
      if (!LARK_NOTIFY_TRIGGER_STATES.has(normalized)) return;
      controller.trigger();
    });
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, []);
};
