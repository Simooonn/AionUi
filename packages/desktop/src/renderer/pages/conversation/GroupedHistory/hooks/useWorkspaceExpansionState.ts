/**
 * In-process publish/subscribe channel for the sidebar project-view state:
 * the expanded-workspace set plus each project's loaded conversation count.
 *
 * Nothing is persisted. A restart collapses every project and resets each one
 * to the default page size (spec AC7).
 *
 * Single-owner contract: only `useConversations` may call
 * `dispatchWorkspaceExpansionChange` — its single call site today is the
 * `useConversations()` mounted by `GroupedHistory/index.tsx`. Several writers
 * would overwrite each other's `lastSnapshot`.
 */
import { useSyncExternalStore } from 'react';

export const WORKSPACE_EXPANSION_EVENT = 'aionui:workspace-expansion-changed';

export type WorkspaceViewSnapshot = {
  expandedWorkspaces: string[];
  loadedCounts: Record<string, number>;
};

const EMPTY_SNAPSHOT: WorkspaceViewSnapshot = { expandedWorkspaces: [], loadedCounts: {} };

// Replaced with a fresh object on every dispatch and stable in between, as
// `useSyncExternalStore` requires of `getSnapshot`.
let lastSnapshot: WorkspaceViewSnapshot = EMPTY_SNAPSHOT;

const getSnapshot = (): WorkspaceViewSnapshot => lastSnapshot;

const subscribe = (onStoreChange: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(WORKSPACE_EXPANSION_EVENT, onStoreChange);
  return () => window.removeEventListener(WORKSPACE_EXPANSION_EVENT, onStoreChange);
};

export const dispatchWorkspaceExpansionChange = (snapshot: WorkspaceViewSnapshot): void => {
  // Must precede the window guard: without a window the server-snapshot branch
  // of `useSyncExternalStore` still reads `getSnapshot`.
  lastSnapshot = snapshot;

  if (typeof window === 'undefined') {
    return;
  }

  // No `detail` payload on purpose — subscribers always read `lastSnapshot`, so
  // an unread `detail` would only invite writing one without the other.
  window.dispatchEvent(new Event(WORKSPACE_EXPANSION_EVENT));
};

export const useWorkspaceExpansionState = (): WorkspaceViewSnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
