/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

/**
 * Per-conversation terminal tab state, kept in a module-level store so it
 * survives `files`/`changes` tab toggles and conversation switches (the
 * authoritative PTY list lives in the main process; this is a lightweight
 * renderer cache rehydrated via `terminal.list` on mount).
 */
export interface ConversationTerminalState {
  /** Ordered terminal ids shown as tabs. */
  ids: string[];
  /** Currently focused terminal id, or null when none exist. */
  activeId: string | null;
}

// Shared empty value — a stable reference so `useSyncExternalStore` does not
// loop when a conversation has no terminals yet.
const EMPTY_STATE: ConversationTerminalState = { ids: [], activeId: null };

const store = new Map<string, ConversationTerminalState>();
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readState(conversationId: string): ConversationTerminalState {
  return store.get(conversationId) ?? EMPTY_STATE;
}

function writeState(conversationId: string, next: ConversationTerminalState): void {
  store.set(conversationId, next);
  emitChange();
}

/**
 * Pick the focus target after the active terminal is closed: prefer the
 * neighbor to the left, otherwise the first remaining terminal.
 */
function pickActiveAfterRemoval(prevIds: string[], removedId: string, remainingIds: string[]): string | null {
  if (remainingIds.length === 0) return null;
  const removedIndex = prevIds.indexOf(removedId);
  const leftNeighbor = removedIndex > 0 ? prevIds[removedIndex - 1] : undefined;
  if (leftNeighbor && remainingIds.includes(leftNeighbor)) return leftNeighbor;
  return remainingIds[0];
}

export const terminalStore = {
  getState: readState,

  /**
   * Reconcile the renderer cache with the authoritative id list from the main
   * process (called after `terminal.list` on mount/reattach). Preserves the
   * current `activeId` when that terminal is still alive, else focuses the first.
   */
  sync(conversationId: string, ids: string[]): void {
    const prev = readState(conversationId);
    const activeId = prev.activeId && ids.includes(prev.activeId) ? prev.activeId : (ids[0] ?? null);
    writeState(conversationId, { ids: [...ids], activeId });
  },

  /** Append a newly created terminal and focus it. */
  add(conversationId: string, terminalId: string): void {
    const prev = readState(conversationId);
    if (prev.ids.includes(terminalId)) {
      writeState(conversationId, { ...prev, activeId: terminalId });
      return;
    }
    writeState(conversationId, { ids: [...prev.ids, terminalId], activeId: terminalId });
  },

  /** Remove a closed terminal and re-focus a survivor. */
  remove(conversationId: string, terminalId: string): void {
    const prev = readState(conversationId);
    if (!prev.ids.includes(terminalId)) return;
    const ids = prev.ids.filter((id) => id !== terminalId);
    const activeId = prev.activeId === terminalId ? pickActiveAfterRemoval(prev.ids, terminalId, ids) : prev.activeId;
    writeState(conversationId, { ids, activeId });
  },

  /** Focus an existing terminal. */
  setActive(conversationId: string, terminalId: string): void {
    const prev = readState(conversationId);
    if (prev.activeId === terminalId || !prev.ids.includes(terminalId)) return;
    writeState(conversationId, { ...prev, activeId: terminalId });
  },

  /** Test helper — drop a conversation's cached state. */
  reset(conversationId: string): void {
    if (store.delete(conversationId)) emitChange();
  },
};

/** Subscribe a component to one conversation's terminal tab state. */
export function useTerminalStore(conversationId: string): ConversationTerminalState {
  return useSyncExternalStore(
    subscribe,
    () => readState(conversationId),
    () => EMPTY_STATE
  );
}
