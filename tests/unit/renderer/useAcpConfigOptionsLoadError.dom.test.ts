/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto } from '@/common/types/platform/acpTypes';
import { useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';

const { responseStreamHandlers } = vi.hoisted(() => ({
  responseStreamHandlers: [] as Array<(message: IResponseMessage) => void>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { ensureRuntime: { invoke: vi.fn() } },
    acpConversation: {
      setConfigOption: { invoke: vi.fn() },
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlers.push(handler);
          return () => {
            const index = responseStreamHandlers.indexOf(handler);
            if (index >= 0) responseStreamHandlers.splice(index, 1);
          };
        }),
      },
    },
  },
}));

const configOptions: AcpConfigOptionDto[] = [
  {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: 'gpt-5.5',
    options: [{ value: 'gpt-5.5', name: 'GPT-5.5' }],
  },
];

const teamLoadConflict = (code: string, message: string) =>
  new BackendHttpError({
    method: 'GET',
    path: '/api/teams/team-1/conversations/conv-1/config-options',
    status: 409,
    body: { success: false, error: message, code },
  });

const createSwrWrapper = () => {
  const cache = new Map();

  return function SwrTestWrapper({ children }: PropsWithChildren) {
    return createElement(
      SWRConfig,
      { value: { provider: () => cache, dedupingInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false } },
      children
    );
  };
};

// The port must keep its identity across renders: `reload` is memoized on it,
// and a fresh object each render would re-fire the mount load effect.
const renderWithLoad = (load: () => Promise<AcpConfigOptionDto[]>) => {
  const configOptionsPort = { load };

  return renderHook(() => useAcpConfigOptions({ conversation_id: 'conv-1', configOptionsPort }), {
    wrapper: createSwrWrapper(),
  });
};

describe('useAcpConfigOptions load errors', () => {
  beforeEach(() => {
    responseStreamHandlers.length = 0;
  });

  // The team page mounts every member's chat view under the warmup overlay, so
  // the first read races the session bootstrap. Surfacing that race as a
  // startup failure used to flash a red toast per member on team creation.
  it.each([
    ['TEAM_RUNTIME_NOT_READY', 'Team agent runtime is not ready for conversation: conv-1'],
    ['TEAM_MEMBER_RUNTIME_STARTING', 'Team member runtime is starting'],
  ])('keeps loadError empty while the runtime is still starting (%s)', async (code, message) => {
    const load = vi.fn().mockRejectedValue(teamLoadConflict(code, message));

    const { result } = renderWithLoad(load);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.loadError).toBeNull();
    expect(result.current.configOptions).toBeNull();
  });

  it('still reports a runtime that genuinely failed to start', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/runtime/ensure',
      status: 502,
      body: { success: false, error: 'Upstream service unavailable.', code: 'BAD_GATEWAY' },
    });
    const load = vi.fn().mockRejectedValue(error);

    const { result } = renderWithLoad(load);

    await waitFor(() => {
      expect(result.current.loadError).toBe(error);
    });
  });

  it('clears a prior failure once the runtime comes up', async () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/conversations/conv-1/runtime/ensure',
      status: 502,
      body: { success: false, error: 'Upstream service unavailable.', code: 'BAD_GATEWAY' },
    });
    const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(configOptions);

    const { result } = renderWithLoad(load);

    await waitFor(() => {
      expect(result.current.loadError).toBe(error);
    });

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.loadError).toBeNull();
      expect(result.current.configOptions).toEqual(configOptions);
    });
  });
});
