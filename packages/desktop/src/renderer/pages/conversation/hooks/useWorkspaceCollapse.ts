import { blurActiveElement } from '@/renderer/utils/ui/focus';
import {
  WORKSPACE_HAS_FILES_EVENT,
  dispatchWorkspaceStateEvent,
  type WorkspaceHasFilesDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import { readWorkspaceCollapsePreference } from '@/renderer/utils/workspace/mainContentPanels';
import { useEffect, useRef } from 'react';

type UseWorkspaceCollapseParams = {
  workspaceEnabled: boolean;
  isMobile: boolean;
  /**
   * Identifier whose change forces a mobile collapse (typically the active
   * conversation id; in team mode, the active agent's conversation id).
   */
  conversation_id?: string;
  /**
   * Stable key used to persist the user's manual toggle preference. Single-chat
   * uses `conversation_id`; team mode passes `team_id` so the preference
   * survives agent-tab switches and follows the team as a whole.
   */
  preferenceKey?: string;
  /**
   * True when the current workspace is an auto-created temporary one (no folder
   * picked by the user). Auto-expand on hasFiles is suppressed in that case so
   * that "send 你好 without picking a folder" leaves the panel collapsed.
   */
  isTemporaryWorkspace?: boolean;
  /** Controlled right-collapsed state owned by ChatLayout coordinator. */
  rightSiderCollapsed: boolean;
  /**
   * All right-panel mutations go through the ChatLayout coordinator so the
   * main-content invariant (middle vs right) cannot be bypassed.
   */
  applyRightCollapsed: (collapsed: boolean, reason: string) => void;
};

type UseWorkspaceCollapseReturn = {
  rightSiderCollapsed: boolean;
};

/**
 * Workspace panel collapse policy (hasFiles / mobile / enabled).
 *
 * Manual toggle is owned by ChatLayout (listens WORKSPACE_TOGGLE_EVENT).
 * This hook never free-flips right state.
 */
export function useWorkspaceCollapse({
  workspaceEnabled,
  isMobile,
  conversation_id,
  preferenceKey,
  isTemporaryWorkspace,
  rightSiderCollapsed,
  applyRightCollapsed,
}: UseWorkspaceCollapseParams): UseWorkspaceCollapseReturn {
  const rightCollapsedRef = useRef(rightSiderCollapsed);

  useEffect(() => {
    rightCollapsedRef.current = rightSiderCollapsed;
  }, [rightSiderCollapsed]);

  // Auto expand/collapse workspace panel based on files state (user preference takes priority)
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasFiles = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasFilesDetail>).detail;

      // Mobile: always keep workspace collapsed to avoid covering main chat area
      if (isMobile) {
        if (!rightCollapsedRef.current) {
          applyRightCollapsed(true, 'hasFiles-mobile');
        }
        return;
      }

      const userPreference = readWorkspaceCollapsePreference(preferenceKey);

      if (userPreference) {
        const shouldCollapse = userPreference === 'collapsed';
        if (shouldCollapse !== rightCollapsedRef.current) {
          applyRightCollapsed(shouldCollapse, 'hasFiles-userPreference');
        }
      } else {
        // No user preference: decide by workspace kind + when the files appeared.
        const isUserPicked = !isTemporaryWorkspace;
        const isMidSession = !detail.isInitial;
        const allowAutoExpand = isUserPicked || isMidSession;
        if (allowAutoExpand && detail.hasFiles && rightCollapsedRef.current) {
          applyRightCollapsed(false, 'hasFiles-autoExpand');
        } else if (!detail.hasFiles && !rightCollapsedRef.current) {
          applyRightCollapsed(true, 'hasFiles-autoCollapse');
        }
      }
    };
    window.addEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    };
  }, [isMobile, workspaceEnabled, isTemporaryWorkspace, preferenceKey, applyRightCollapsed]);

  // Broadcast workspace state event
  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  // Force collapse when workspace is disabled
  useEffect(() => {
    if (!workspaceEnabled && !rightCollapsedRef.current) {
      applyRightCollapsed(true, 'workspace-disabled');
    }
  }, [workspaceEnabled, applyRightCollapsed]);

  // Mobile: force collapse when entering mobile mode
  useEffect(() => {
    if (!workspaceEnabled || !isMobile || rightCollapsedRef.current) {
      return;
    }
    applyRightCollapsed(true, 'mobile-enter');
  }, [isMobile, workspaceEnabled, applyRightCollapsed]);

  // Mobile: force collapse workspace on conversation switch to prevent overlay
  useEffect(() => {
    if (!workspaceEnabled || !isMobile) {
      return;
    }
    applyRightCollapsed(true, 'mobile-conversation-switch');
  }, [conversation_id, isMobile, workspaceEnabled, applyRightCollapsed]);

  // Mobile: blur active element on conversation switch to prevent soft keyboard
  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      blurActiveElement();
    });
    return () => cancelAnimationFrame(rafId);
  }, [conversation_id, isMobile]);

  return { rightSiderCollapsed };
}
