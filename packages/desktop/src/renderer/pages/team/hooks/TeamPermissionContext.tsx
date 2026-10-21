import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { createTeamConfigOptionsPort, type TeamConfigOptionsPort } from './teamConfigOptions';

type TeamPermissionContextValue = {
  /** Whether we are in team mode */
  isTeamMode: true;
  /** Whether the current active agent is the team leader */
  isLeaderAgent: boolean;
  /** Conversation ID of the leader agent */
  leaderConversationId: string;
  /** All agent conversation IDs in this team (for centralized confirmation listening) */
  allConversationIds: string[];
  /** Propagate a permission mode change from the leader to all member agents */
  propagateMode: (mode: string) => void;
  /** Trigger session warmup (idempotent, returns cached promise) */
  warmupSession: () => Promise<void>;
  /** Read/write runtime config options through the team-owned session */
  configOptionsPort: TeamConfigOptionsPort;
  /** Whether the whole team session is up (page-level warmup phase is 'ready') */
  sessionReady: boolean;
};

const TeamPermissionContext = createContext<TeamPermissionContextValue | null>(null);

export const TeamPermissionProvider: React.FC<{
  children: React.ReactNode;
  team_id: string;
  isLeaderAgent: boolean;
  leaderConversationId: string;
  allConversationIds: string[];
  runtimeStartingConversationIds: ReadonlySet<string>;
  sessionReady: boolean;
}> = ({
  children,
  team_id,
  isLeaderAgent,
  leaderConversationId,
  allConversationIds,
  runtimeStartingConversationIds,
  sessionReady,
}) => {
  const warmupPromiseRef = useRef<Promise<void> | null>(null);

  const propagateMode = useCallback(
    (mode: string) => {
      // Persist session_mode on the team record so newly spawned agents inherit it
      void ipcBridge.team.setSessionMode.invoke({ team_id, session_mode: mode }).catch(() => {
        // Best-effort: if this fails, active agents still receive per-conversation config updates.
      });
    },
    [team_id]
  );

  const warmupSession = useCallback((): Promise<void> => {
    if (warmupPromiseRef.current) {
      return warmupPromiseRef.current;
    }

    const promise = ipcBridge.team.ensureSession.invoke({ team_id });
    // Fire-and-forget callers only use warmup as a hint; attach a no-op catch
    // so rejected warmups do not surface as unhandled promise rejections.
    void promise.catch(() => {});
    warmupPromiseRef.current = promise.finally(() => {
      warmupPromiseRef.current = null;
    });
    return warmupPromiseRef.current;
  }, [team_id]);

  // The functions that do I/O only depend on the team, so they keep their
  // identity for the team's lifetime. Consumers key their fetch effects on
  // these functions; rebuilding them on every run-state update is what used to
  // re-fire config-options reads (and, via the context, ensureSession) in a loop.
  const basePort = useMemo(
    () =>
      createTeamConfigOptionsPort({
        team_id,
        warmupSession,
        getConfigOptions: (targetTeamId, conversation_id) =>
          ipcBridge.team.getConfigOptions.invoke({ team_id: targetTeamId, conversation_id }),
        setConfigOption: (conversation_id, option_id, value) =>
          ipcBridge.team.setConfigOption.invoke({ team_id, conversation_id, option_id, value }),
      }),
    [team_id, warmupSession]
  );

  // Callers hand in a fresh Set whenever run state is re-indexed, even when its
  // contents did not move. Key it by content so the blocking policy below only
  // changes — and only re-renders the pickers — when a runtime really starts or
  // finishes starting. Conversation ids are short hex strings, so '\n' is a safe
  // separator.
  const runtimeStartingKey = [...runtimeStartingConversationIds].toSorted().join('\n');
  const stableRuntimeStartingIds = useMemo(
    () => new Set(runtimeStartingKey ? runtimeStartingKey.split('\n') : []),
    [runtimeStartingKey]
  );

  const configOptionsPort = useMemo<TeamConfigOptionsPort>(
    () => ({
      ...basePort,
      isConfigOptionBlocked: (conversation_id, _option_id, category) =>
        stableRuntimeStartingIds.has(conversation_id) ||
        (conversation_id === leaderConversationId && category === 'mode' && stableRuntimeStartingIds.size > 0),
    }),
    [basePort, leaderConversationId, stableRuntimeStartingIds]
  );

  const value = useMemo<TeamPermissionContextValue>(
    () => ({
      isTeamMode: true,
      isLeaderAgent,
      leaderConversationId,
      allConversationIds,
      propagateMode,
      warmupSession,
      configOptionsPort,
      sessionReady,
    }),
    [
      isLeaderAgent,
      leaderConversationId,
      allConversationIds,
      propagateMode,
      warmupSession,
      configOptionsPort,
      sessionReady,
    ]
  );

  return <TeamPermissionContext.Provider value={value}>{children}</TeamPermissionContext.Provider>;
};

/**
 * Returns team permission context if inside a team, or null for standalone conversations.
 * This ensures all team-only logic is gated behind a null check — no impact on single agent mode.
 */
export const useTeamPermission = (): TeamPermissionContextValue | null => {
  return useContext(TeamPermissionContext);
};
