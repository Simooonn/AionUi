/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

/**
 * Shared ~60s clock for relative-time labels.
 *
 * A single module-level interval serves all subscribers (one timer for N rows).
 * Subscribers are ref-counted: the interval starts on the first subscriber and
 * is cleared when the last one unsubscribes, so no timer outlives its users.
 */

const TICK_INTERVAL_MS = 60_000;

let nowMs = Date.now();
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (intervalId === null) {
    // Refresh immediately so a fresh mount never reads a stale snapshot
    nowMs = Date.now();
    intervalId = setInterval(() => {
      nowMs = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_INTERVAL_MS);
    // Notify so subscribers re-read the refreshed snapshot (the initial
    // render may have happened before this subscribe-time refresh)
    listeners.forEach((notify) => notify());
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
};

const getSnapshot = (): number => nowMs;

/** Subscribe to the shared minute tick; returns the current epoch ms snapshot. */
export const useRelativeTimeTick = (): number => {
  return useSyncExternalStore(subscribe, getSnapshot);
};
