/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ace: the ACP header no longer mounts AcpModelSelector, so the restart button
 * must learn runtime readiness from the config-options hook itself. Guards the
 * merge regression where the button stayed "initializing" forever.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAcpConfigOptionsMock } = vi.hoisted(() => ({ useAcpConfigOptionsMock: vi.fn() }));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  useAcpConfigOptions: useAcpConfigOptionsMock,
}));

import { useAcpRestartAvailability } from '@/renderer/pages/conversation/runtime/useAcpRestartAvailability';
import type { TChatConversation } from '@/common/config/storage';

const conversation = (type: string, id = 'conv-1') => ({ id, type }) as unknown as TChatConversation;

describe('useAcpRestartAvailability', () => {
  beforeEach(() => {
    useAcpConfigOptionsMock.mockReset();
  });

  it('reports ready once the ACP runtime config has loaded', () => {
    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: true });

    const { result } = renderHook(() => useAcpRestartAvailability(conversation('acp')));

    expect(result.current).toBe('ready');
    expect(useAcpConfigOptionsMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', enabled: true });
  });

  it('stays initializing while the ACP runtime config is still loading', () => {
    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: false });

    const { result } = renderHook(() => useAcpRestartAvailability(conversation('acp')));

    expect(result.current).toBe('initializing');
  });

  it('flips from initializing to ready when readiness arrives after mount', () => {
    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: false });
    const { result, rerender } = renderHook(() => useAcpRestartAvailability(conversation('acp')));
    expect(result.current).toBe('initializing');

    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: true });
    rerender();

    expect(result.current).toBe('ready');
  });

  it('keeps the subscription disabled and never reports ready for a non-ACP conversation', () => {
    // A stale "ready" from the hook must not leak through for a type that has no runtime.
    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: true });

    const { result } = renderHook(() => useAcpRestartAvailability(conversation('antigravity')));

    expect(result.current).toBe('initializing');
    expect(useAcpConfigOptionsMock).toHaveBeenCalledWith({ conversation_id: 'conv-1', enabled: false });
  });

  it('handles a missing conversation without enabling the subscription', () => {
    useAcpConfigOptionsMock.mockReturnValue({ isRuntimeReady: false });

    const { result } = renderHook(() => useAcpRestartAvailability(undefined));

    expect(result.current).toBe('initializing');
    expect(useAcpConfigOptionsMock).toHaveBeenCalledWith({ conversation_id: '', enabled: false });
  });
});
