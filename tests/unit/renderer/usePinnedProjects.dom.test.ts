import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

// store/subscribers at module scope so the hoisted vi.mock captures them via closure.
const store: Map<string, unknown> = new Map();
const subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

// Mirror configService: set() writes the store then synchronously notifies the
// key's subscribers (as the real service does before its await), so the hook's
// subscription is the single update path.
vi.mock('@/common/config/configService', () => {
  const whenReady = vi.fn<() => Promise<void>>();
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
    vi.mocked(configService.whenReady).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('recovers persisted pins after hydration rejects without opening readiness early', async () => {
    vi.useFakeTimers();
    let finishHydration!: () => void;
    vi.mocked(configService.whenReady)
      .mockRejectedValueOnce(new Error('Config unavailable'))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishHydration = resolve;
          })
      );
    const { result } = renderHook(() => usePinnedProjects());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current).toMatchObject({ isReady: false, pinnedList: [] });

    await act(async () => {
      // Initialization populates the cache without notifying subscribers.
      store.set(KEY, ['/b', '/a']);
      finishHydration();
    });
    expect(result.current).toMatchObject({ isReady: true, pinnedList: ['/b', '/a'], pinnedSet: new Set(['/b', '/a']) });
    expect(configService.set).not.toHaveBeenCalled();
  });

  it('spaces repeated hydration failures apart instead of retrying in a tight loop', async () => {
    vi.useFakeTimers();
    vi.mocked(configService.whenReady).mockRejectedValue(new Error('Config unavailable'));
    const { result } = renderHook(() => usePinnedProjects());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(configService.whenReady).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2001);
    });
    expect(configService.whenReady).toHaveBeenCalledTimes(4);
    expect(result.current.isReady).toBe(false);
  });

  it('stops retrying and updating after hydration recovers', async () => {
    vi.useFakeTimers();
    store.set(KEY, ['/a']);
    vi.mocked(configService.whenReady).mockRejectedValueOnce(new Error('Config unavailable'));
    const { result } = renderHook(() => usePinnedProjects());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const hydrated = result.current;
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(configService.whenReady).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(hydrated);
  });

  it('clears a scheduled hydration retry and its subscription on unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(configService.whenReady).mockRejectedValue(new Error('Config unavailable'));
    const { unmount } = renderHook(() => usePinnedProjects());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect({ timers: vi.getTimerCount(), subscribers: subscribers.get(KEY)?.size }).toEqual({
      timers: 0,
      subscribers: 0,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(configService.whenReady).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an in-flight retry that settles with %s after unmount',
    async (outcome) => {
      vi.useFakeTimers();
      let resolveHydration!: () => void;
      let rejectHydration!: (reason: Error) => void;
      vi.mocked(configService.whenReady)
        .mockRejectedValueOnce(new Error('Config unavailable'))
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              resolveHydration = resolve;
              rejectHydration = reject;
            })
        );
      const { result, unmount } = renderHook(() => usePinnedProjects());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      unmount();
      const beforeSettlement = result.current;
      const getConfig = vi.spyOn(configService, 'get');
      try {
        await act(async () => {
          store.set(KEY, ['/late']);
          if (outcome === 'resolve') resolveHydration();
          else rejectHydration(new Error('Config still unavailable'));
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getConfig).not.toHaveBeenCalled();
        expect(result.current).toBe(beforeSettlement);
        expect({ calls: vi.mocked(configService.whenReady).mock.calls.length, timers: vi.getTimerCount() }).toEqual({
          calls: 2,
          timers: 0,
        });
      } finally {
        getConfig.mockRestore();
      }
    }
  );

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

  it('pruneOrphans preserves the persisted list and order without complete-ok permission', async () => {
    store.set(KEY, ['/a', '/gone']);
    const { result } = renderHook(() => usePinnedProjects());
    await waitFor(() => expect(result.current.pinnedList).toEqual(['/a', '/gone']));
    await act(async () => {
      await result.current.pruneOrphans(new Set(['/a']), false);
    });
    // Never wipe pins on the empty/pending pre-load state.
    expect(configService.set).not.toHaveBeenCalled();
    expect(result.current.pinnedList).toEqual(['/a', '/gone']);
    expect(store.get(KEY)).toEqual(['/a', '/gone']);
  });

  it('pruneOrphans drops absent workspaces only with complete-ok permission', async () => {
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
