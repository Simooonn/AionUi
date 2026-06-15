import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// store/subscribers at module scope so the hoisted vi.mock captures them via closure.
const store: Map<string, unknown> = new Map();
const subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

// Mirror configService: set() writes the store then synchronously notifies the
// key's subscribers (as the real service does before its await), so the hook's
// subscription is the single update path.
vi.mock('@/common/config/configService', () => {
  const whenReady = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    configService: {
      whenReady,
      get: (k: string) => store.get(k),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
        const subs = subscribers.get(k);
        if (subs) {
          for (const cb of subs) {
            cb(v);
          }
        }
      }),
      subscribe: (k: string, cb: (value: unknown) => void) => {
        if (!subscribers.has(k)) {
          subscribers.set(k, new Set());
        }
        subscribers.get(k)!.add(cb);
        return () => {
          subscribers.get(k)?.delete(cb);
        };
      },
    },
  };
});

import { usePinnedProjects } from '@renderer/pages/conversation/GroupedHistory/hooks/usePinnedProjects';
import { configService } from '@/common/config/configService';

const KEY = 'sidebar.pinnedProjects';

describe('usePinnedProjects', () => {
  beforeEach(() => {
    store.clear();
    subscribers.clear();
    vi.clearAllMocks();
  });

  it('seeds pinned list from the persisted config value after whenReady', async () => {
    store.set(KEY, ['/a', '/b']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/b']));
    expect(result.current.isPinned('/a')).toBe(true);
    expect(result.current.isPinned('/c')).toBe(false);
  });

  it('togglePin appends an unpinned workspace and persists the new array', async () => {
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual([]));
    await act(async () => {
      await result.current.togglePin('/x');
    });
    expect(configService.set).toHaveBeenCalledWith(KEY, ['/x']);
    expect(result.current.pinnedList).toEqual(['/x']);
  });

  it('togglePin removes an already-pinned workspace', async () => {
    store.set(KEY, ['/x', '/y']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/x', '/y']));
    await act(async () => {
      await result.current.togglePin('/x');
    });
    expect(configService.set).toHaveBeenCalledWith(KEY, ['/y']);
    expect(result.current.pinnedList).toEqual(['/y']);
  });

  it('reorder moves a workspace to a new index (array order = display order)', async () => {
    store.set(KEY, ['/a', '/b', '/c']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/b', '/c']));
    await act(async () => {
      await result.current.reorder('/a', '/c');
    });
    expect(result.current.pinnedList).toEqual(['/b', '/c', '/a']);
  });

  it('reorder is a no-op when either workspace is not pinned', async () => {
    store.set(KEY, ['/a', '/b']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/b']));
    await act(async () => {
      await result.current.reorder('/a', '/missing');
    });
    expect(configService.set).not.toHaveBeenCalled();
  });

  it('pruneOrphans does nothing before conversations have loaded', async () => {
    store.set(KEY, ['/a', '/gone']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/gone']));
    await act(async () => {
      await result.current.pruneOrphans(new Set(['/a']), false);
    });
    // Never wipe pins on the empty/pending pre-load state.
    expect(configService.set).not.toHaveBeenCalled();
    expect(result.current.pinnedList).toEqual(['/a', '/gone']);
  });

  it('pruneOrphans drops entries with no surviving workspace once loaded', async () => {
    store.set(KEY, ['/a', '/gone']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/gone']));
    await act(async () => {
      await result.current.pruneOrphans(new Set(['/a']), true);
    });
    expect(configService.set).toHaveBeenCalledWith(KEY, ['/a']);
    expect(result.current.pinnedList).toEqual(['/a']);
  });

  it('pruneOrphans does not write when nothing is orphaned', async () => {
    store.set(KEY, ['/a', '/b']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/b']));
    await act(async () => {
      await result.current.pruneOrphans(new Set(['/a', '/b']), true);
    });
    expect(configService.set).not.toHaveBeenCalled();
  });

  it('pruneOrphans does not write when the pinned list is empty', async () => {
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual([]));
    await act(async () => {
      await result.current.pruneOrphans(new Set(), true);
    });
    expect(configService.set).not.toHaveBeenCalled();
  });
});
