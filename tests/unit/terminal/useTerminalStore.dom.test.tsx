/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the renderer useTerminalStore (Step 5 acceptance).
 * Runs in the `dom` (jsdom) Vitest project.
 *
 * The store is a module-level `useSyncExternalStore` cache of per-conversation
 * tab state ({ ids, activeId }), rehydrated from the authoritative main-process
 * list via `sync`. The soft cap of 10 lives in TerminalTabs (the "+" button),
 * not here, so it is covered by that component, not this store.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { terminalStore, useTerminalStore } from '@/renderer/pages/conversation/Workspace/terminal/useTerminalStore';

const C = 'conv-1';
const C2 = 'conv-2';

afterEach(() => {
  terminalStore.reset(C);
  terminalStore.reset(C2);
});

describe('terminalStore', () => {
  describe('getState', () => {
    it('returns an empty state for an unknown conversation', () => {
      expect(terminalStore.getState('ghost')).toEqual({ ids: [], activeId: null });
    });
  });

  describe('add', () => {
    it('appends a terminal and focuses it', () => {
      terminalStore.add(C, 't1');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1'], activeId: 't1' });
    });

    it('keeps insertion order and focuses the newest', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1', 't2'], activeId: 't2' });
    });

    it('does not duplicate an existing id but re-focuses it', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2');
      terminalStore.add(C, 't1');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1', 't2'], activeId: 't1' });
    });

    it('keeps conversations isolated', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C2, 'x1');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1'], activeId: 't1' });
      expect(terminalStore.getState(C2)).toEqual({ ids: ['x1'], activeId: 'x1' });
    });
  });

  describe('remove', () => {
    it('removes the active terminal and focuses the left neighbor', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2');
      terminalStore.add(C, 't3'); // active t3
      terminalStore.setActive(C, 't2'); // active t2
      terminalStore.remove(C, 't2');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1', 't3'], activeId: 't1' });
    });

    it('focuses the first survivor when the leftmost active is removed', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2');
      terminalStore.setActive(C, 't1');
      terminalStore.remove(C, 't1');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t2'], activeId: 't2' });
    });

    it('leaves the active focus untouched when a non-active terminal is removed', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2'); // active t2
      terminalStore.remove(C, 't1');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t2'], activeId: 't2' });
    });

    it('clears focus when the last terminal is removed', () => {
      terminalStore.add(C, 't1');
      terminalStore.remove(C, 't1');
      expect(terminalStore.getState(C)).toEqual({ ids: [], activeId: null });
    });

    it('is a no-op for an unknown id', () => {
      terminalStore.add(C, 't1');
      terminalStore.remove(C, 'ghost');
      expect(terminalStore.getState(C)).toEqual({ ids: ['t1'], activeId: 't1' });
    });
  });

  describe('setActive', () => {
    it('focuses an existing terminal', () => {
      terminalStore.add(C, 't1');
      terminalStore.add(C, 't2'); // active t2
      terminalStore.setActive(C, 't1');
      expect(terminalStore.getState(C).activeId).toBe('t1');
    });

    it('is a no-op for an id not in the conversation', () => {
      terminalStore.add(C, 't1');
      terminalStore.setActive(C, 'ghost');
      expect(terminalStore.getState(C).activeId).toBe('t1');
    });
  });

  describe('sync (rehydrate from terminal.list)', () => {
    it('reconciles ids and focuses the first when nothing was active', () => {
      terminalStore.sync(C, ['a', 'b', 'c']);
      expect(terminalStore.getState(C)).toEqual({ ids: ['a', 'b', 'c'], activeId: 'a' });
    });

    it('preserves the active focus when that terminal survives', () => {
      terminalStore.sync(C, ['a', 'b', 'c']);
      terminalStore.setActive(C, 'b');
      terminalStore.sync(C, ['a', 'b']);
      expect(terminalStore.getState(C)).toEqual({ ids: ['a', 'b'], activeId: 'b' });
    });

    it('re-focuses the first when the active terminal is gone', () => {
      terminalStore.sync(C, ['a', 'b']);
      terminalStore.setActive(C, 'b');
      terminalStore.sync(C, ['a', 'c']);
      expect(terminalStore.getState(C)).toEqual({ ids: ['a', 'c'], activeId: 'a' });
    });

    it('clears focus when synced to an empty list', () => {
      terminalStore.sync(C, ['a']);
      terminalStore.sync(C, []);
      expect(terminalStore.getState(C)).toEqual({ ids: [], activeId: null });
    });
  });
});

describe('useTerminalStore hook', () => {
  it('returns the current state and re-renders on store changes', () => {
    const { result } = renderHook(() => useTerminalStore(C));
    expect(result.current).toEqual({ ids: [], activeId: null });

    act(() => {
      terminalStore.add(C, 't1');
    });
    expect(result.current).toEqual({ ids: ['t1'], activeId: 't1' });

    act(() => {
      terminalStore.remove(C, 't1');
    });
    expect(result.current).toEqual({ ids: [], activeId: null });
  });
});
