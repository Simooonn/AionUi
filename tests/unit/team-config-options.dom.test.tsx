import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { TeamPermissionProvider, useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { createTeamConfigOptionsPort } from '@/renderer/pages/team/hooks/teamConfigOptions';

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      ensureSession: { invoke: vi.fn().mockResolvedValue(undefined) },
      getConfigOptions: { invoke: vi.fn().mockResolvedValue({ config_options: [] }) },
      setConfigOption: { invoke: vi.fn() },
      setSessionMode: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

describe('createTeamConfigOptionsPort', () => {
  const configOptionsResponse = {
    config_options: [
      {
        id: 'model',
        category: 'model',
        type: 'select',
        current_value: 'gpt-5.5',
        options: [{ value: 'gpt-5.5', label: 'GPT 5.5' }],
      },
    ],
  };

  it('loads a conversation config snapshot without warming the whole team', async () => {
    const calls: string[] = [];
    const warmupSession = vi.fn(() => {
      calls.push('warmup');
      return Promise.resolve();
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return configOptionsResponse;
    });
    const port = createTeamConfigOptionsPort({
      team_id: 'team-1',
      warmupSession,
      getConfigOptions,
    });

    const result = await port.load('conversation-1');

    expect(calls).toEqual(['get:team-1:conversation-1']);
    expect(warmupSession).not.toHaveBeenCalled();
    expect(result?.[0]?.current_value).toBe('gpt-5.5');
  });

  it('can await warmup explicitly when callers need the whole team ready', async () => {
    const calls: string[] = [];
    const warmupSession = vi.fn(async () => {
      calls.push('warmup');
    });
    const getConfigOptions = vi.fn(async (team_id: string, conversation_id: string) => {
      calls.push(`get:${team_id}:${conversation_id}`);
      return configOptionsResponse;
    });
    const port = createTeamConfigOptionsPort({
      team_id: 'team-1',
      warmupSession,
      getConfigOptions,
    });

    await port.warmup();
    const result = await port.load('conversation-1');

    expect(calls).toEqual(['warmup', 'get:team-1:conversation-1']);
    expect(result?.[0]?.current_value).toBe('gpt-5.5');
  });

  it('exposes the team-owned setter and runtime Starting blocker', async () => {
    const setConfigOption = vi.fn(async () => ({
      confirmation: 'observed' as const,
      config_options: configOptionsResponse.config_options,
    }));
    const isConfigOptionBlocked = vi.fn(
      (conversation_id: string, _option_id: string, _category: string) => conversation_id === 'conversation-starting'
    );
    const port = createTeamConfigOptionsPort({
      team_id: 'team-1',
      warmupSession: vi.fn(async () => {}),
      getConfigOptions: vi.fn(async () => configOptionsResponse),
      setConfigOption,
      isConfigOptionBlocked,
    });

    const response = await port.setConfigOption?.('conversation-ready', 'model', 'gpt-5.5');

    expect(setConfigOption).toHaveBeenCalledWith('conversation-ready', 'model', 'gpt-5.5');
    expect(response?.confirmation).toBe('observed');
    expect(port.isConfigOptionBlocked?.('conversation-starting', 'model', 'model')).toBe(true);
    expect(port.isConfigOptionBlocked?.('conversation-ready', 'model', 'model')).toBe(false);
  });

  it('surfaces team runtime-not-ready without retrying config loads', async () => {
    vi.useFakeTimers();
    try {
      const runtimeNotReady = new BackendHttpError({
        method: 'GET',
        path: '/api/teams/team-1/conversations/conversation-1/config-options',
        status: 409,
        body: {
          success: false,
          error: 'Team agent runtime is not ready for conversation: conversation-1',
          code: 'TEAM_RUNTIME_NOT_READY',
          details: { conversation_id: 'conversation-1' },
        },
      });
      const warmupSession = vi.fn(async () => {});
      const getConfigOptions = vi.fn().mockRejectedValue(runtimeNotReady);
      const port = createTeamConfigOptionsPort({
        team_id: 'team-1',
        warmupSession,
        getConfigOptions,
      });

      const resultPromise = port.load('conversation-1');
      const expectation = expect(resultPromise).rejects.toBe(runtimeNotReady);

      await vi.advanceTimersByTimeAsync(31_000);

      await expectation;
      expect(getConfigOptions).toHaveBeenCalledTimes(1);
      expect(warmupSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry ordinary config load failures', async () => {
    const error = new BackendHttpError({
      method: 'GET',
      path: '/api/teams/team-1/conversations/conversation-1/config-options',
      status: 400,
      body: {
        success: false,
        error: 'bad request',
        code: 'BAD_REQUEST',
      },
    });
    const getConfigOptions = vi.fn().mockRejectedValue(error);
    const port = createTeamConfigOptionsPort({
      team_id: 'team-1',
      warmupSession: vi.fn(async () => {}),
      getConfigOptions,
    });

    await expect(port.load('conversation-1')).rejects.toBe(error);
    expect(getConfigOptions).toHaveBeenCalledTimes(1);
  });
});

describe('TeamPermissionProvider', () => {
  type ProviderValue = NonNullable<ReturnType<typeof useTeamPermission>>;

  const ALL_CONVERSATION_IDS = ['lead', 'c1', 'c2'];

  // Render the real provider and record every context value it publishes, so a
  // test can compare identities across re-renders.
  const renderProvider = (runtimeStarting: ReadonlySet<string>, sessionReady = false) => {
    const seen: ProviderValue[] = [];
    const Probe = () => {
      const value = useTeamPermission();
      if (value) seen.push(value);
      return null;
    };
    const tree = (ids: ReadonlySet<string>, ready: boolean) => (
      <TeamPermissionProvider
        team_id='team-1'
        isLeaderAgent
        leaderConversationId='lead'
        allConversationIds={ALL_CONVERSATION_IDS}
        runtimeStartingConversationIds={ids}
        sessionReady={ready}
      >
        <Probe />
      </TeamPermissionProvider>
    );
    const view = render(tree(runtimeStarting, sessionReady));
    return {
      seen,
      latest: () => seen[seen.length - 1],
      rerender: (ids: ReadonlySet<string>, ready = sessionReady) => view.rerender(tree(ids, ready)),
    };
  };

  // A run-state re-index hands the provider a new Set with the same members; the
  // port must not change, or every member re-reads config options in a loop.
  it('keeps the port and its load function when the runtime-starting set is rebuilt with the same members', () => {
    const view = renderProvider(new Set(['c1']));
    const before = view.latest().configOptionsPort;

    view.rerender(new Set(['c1']));

    const after = view.latest().configOptionsPort;
    expect(after).toBe(before);
    expect(after.load).toBe(before.load);
  });

  it('swaps only the blocking policy when the runtime-starting members change', () => {
    const view = renderProvider(new Set(['c1']));
    const before = view.latest().configOptionsPort;
    expect(before.isConfigOptionBlocked?.('c1', 'model', 'model')).toBe(true);
    expect(before.isConfigOptionBlocked?.('c2', 'model', 'model')).toBe(false);

    view.rerender(new Set(['c2']));

    const after = view.latest().configOptionsPort;
    expect(after).not.toBe(before);
    expect(after.isConfigOptionBlocked?.('c1', 'model', 'model')).toBe(false);
    expect(after.isConfigOptionBlocked?.('c2', 'model', 'model')).toBe(true);
    expect(after.load).toBe(before.load);
    expect(after.setConfigOption).toBe(before.setConfigOption);
  });

  it('blocks only the leader mode option while any member runtime is starting', () => {
    const view = renderProvider(new Set(['c1']));
    const port = view.latest().configOptionsPort;
    expect(port.isConfigOptionBlocked?.('lead', 'mode', 'mode')).toBe(true);
    expect(port.isConfigOptionBlocked?.('lead', 'model', 'model')).toBe(false);

    view.rerender(new Set());

    expect(view.latest().configOptionsPort.isConfigOptionBlocked?.('lead', 'mode', 'mode')).toBe(false);
  });

  it('publishes sessionReady and updates it when the team session comes up', () => {
    const view = renderProvider(new Set(), false);
    expect(view.latest().sessionReady).toBe(false);

    view.rerender(new Set(), true);

    expect(view.latest().sessionReady).toBe(true);
  });
});
