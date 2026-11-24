import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSiderTab } from '@/renderer/components/layout/Sider/tabs/useSiderTab';

let currentPathname = '/guid';

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: currentPathname }),
}));

describe('useSiderTab', () => {
  beforeEach(() => {
    localStorage.clear();
    currentPathname = '/guid';
  });

  it('defaults to recent when no tab is stored', () => {
    const { result } = renderHook(() => useSiderTab());

    expect(result.current.activeTab).toBe('recent');
  });

  it('persists manual selection to localStorage and restores it', () => {
    const first = renderHook(() => useSiderTab());
    act(() => first.result.current.setActiveTab('team'));
    expect(localStorage.getItem('sidebar-active-tab')).toBe('team');

    const second = renderHook(() => useSiderTab());
    expect(second.result.current.activeTab).toBe('team');
  });

  it('falls back to recent when the stored value is invalid', () => {
    localStorage.setItem('sidebar-active-tab', 'bogus');

    const { result } = renderHook(() => useSiderTab());

    expect(result.current.activeTab).toBe('recent');
  });

  it('auto-switches to team when the route enters /team/', () => {
    const { result } = renderHook(() => useSiderTab());

    act(() => {
      currentPathname = '/team/abc123';
    });
    // Re-render with the new pathname.
    const { result: rerendered } = renderHook(() => useSiderTab());

    expect(rerendered.current.activeTab).toBe('team');
  });

  it('auto-switches to recent when the route enters /conversation/', () => {
    localStorage.setItem('sidebar-active-tab', 'team');
    const { result } = renderHook(() => useSiderTab());
    expect(result.current.activeTab).toBe('team');

    act(() => {
      currentPathname = '/conversation/xyz';
    });
    const { result: rerendered } = renderHook(() => useSiderTab());

    expect(rerendered.current.activeTab).toBe('recent');
  });
});
