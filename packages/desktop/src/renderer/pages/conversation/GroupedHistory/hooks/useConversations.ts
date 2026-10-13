/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import type { TimelineSection } from '../types';
import { getProjectLoadedCount, loadedCountCovering, PROJECT_PAGE_SIZE } from '../utils/visibleConversationOrder';
import { dispatchWorkspaceExpansionChange } from './useWorkspaceExpansionState';

// Persist section collapsed state across reloads.
const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';

const readCollapsedSections = (): Set<string> => {
  try {
    const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

// Where an active conversation lives, so we can expand the right containers
// before scrolling it into view.
type ConversationLocation = {
  section: 'pinned' | 'projects' | 'conversations';
  workspace?: string;
  /** Position inside the workspace group, in the group's activity order. */
  indexInWorkspace?: number;
};

const locateConversation = (
  id: string,
  pinned: TChatConversation[],
  sections: TimelineSection[]
): ConversationLocation | null => {
  if (pinned.some((c) => c.id === id)) return { section: 'pinned' };
  for (const section of sections) {
    for (const item of section.items) {
      if (item.type === 'workspace' && item.workspaceGroup) {
        const indexInWorkspace = item.workspaceGroup.conversations.findIndex((c) => c.id === id);
        if (indexInWorkspace >= 0) {
          return { section: 'projects', workspace: item.workspaceGroup.workspace, indexInWorkspace };
        }
      } else if (item.type === 'conversation' && item.conversation?.id === id) {
        return { section: 'conversations' };
      }
    }
  }
  return null;
};

/** Every project workspace in the grouped history, in section order. */
const listWorkspaces = (sections: TimelineSection[]): string[] =>
  sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.type === 'workspace' && item.workspaceGroup ? [item.workspaceGroup.workspace] : []
    )
  );

/** `prev` without `keys`; returns `prev` itself when nothing changes so React bails out. */
const withoutSections = (prev: Set<string>, keys: string[]): Set<string> => {
  if (!keys.some((key) => prev.has(key))) return prev;
  const next = new Set(prev);
  keys.forEach((key) => next.delete(key));
  return next;
};

export const useConversations = () => {
  // Projects start collapsed on every launch and each one at the default page
  // size — neither is persisted (spec AC7).
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>([]);
  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => readCollapsedSections());
  const { id } = useParams();
  const {
    conversations,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    clearCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    setActiveConversation,
    groupedHistory,
    hasLoadedOnce,
  } = useConversationHistoryContext();

  const { pinnedConversations, timelineSections } = groupedHistory;

  // Guard so the reveal + scroll for a given active id runs only once.
  // Reset when the active id changes so navigating back to a conversation
  // re-triggers, but manual collapses afterwards are not fought.
  const revealedIdRef = useRef<string | null>(null);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Reveal + scroll the active conversation into view.
  // Depends on the grouped data because on a cold start (opening the app
  // directly on a conversation URL) the list loads asynchronously — we re-run
  // once the target can be located, then expand its section/folder and scroll.
  // Use double-RAF to wait for the newly expanded content (and async siblings
  // like CronJobSiderSection) to render before computing the scroll position.
  useEffect(() => {
    if (!id) {
      setActiveConversation(null);
      revealedIdRef.current = null;
      return;
    }

    setActiveConversation(id);
    clearCompletionUnread(id);
    clearManualUnread(id);

    if (revealedIdRef.current === id) return;

    const location = locateConversation(id, pinnedConversations, timelineSections);
    if (!location) return; // data not loaded yet; effect re-runs when it arrives
    revealedIdRef.current = id;

    // Expand the containing section if collapsed. `locateConversation` reports
    // every workspace conversation as 'projects', but a pinned project renders
    // under the 'pinned-projects' section and this hook cannot tell the two
    // apart, so both keys are reopened.
    setCollapsedSections((prev) =>
      withoutSections(prev, location.section === 'projects' ? ['projects', 'pinned-projects'] : [location.section])
    );
    // Expand the containing project folder if collapsed, and reveal enough
    // pages to include the target row.
    if (location.workspace) {
      const workspace = location.workspace;
      setExpandedWorkspaces((prev) => (prev.includes(workspace) ? prev : [...prev, workspace]));
      const targetIndex = location.indexInWorkspace ?? 0;
      setLoadedCounts((prev) => {
        // Monotonic: a later, shorter list must not shrink what is revealed.
        const needed = loadedCountCovering(targetIndex);
        const current = getProjectLoadedCount(prev, workspace);
        return needed <= current ? prev : { ...prev, [workspace]: needed };
      });
    }

    let cancelled = false;
    let outerRafId: number;
    let innerRafId: number;
    outerRafId = requestAnimationFrame(() => {
      innerRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const element = document.getElementById('c-' + id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRafId);
      cancelAnimationFrame(innerRafId);
    };
  }, [clearCompletionUnread, clearManualUnread, id, setActiveConversation, pinnedConversations, timelineSections]);

  // Publish the project-view snapshot to the subscribers (nothing is persisted).
  useEffect(() => {
    dispatchWorkspaceExpansionChange({ expandedWorkspaces, loadedCounts });
  }, [expandedWorkspaces, loadedCounts]);

  // Persist section collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsedSections]));
    } catch {
      // ignore
    }
  }, [collapsedSections]);

  // Remove stale workspace entries that no longer exist in the data
  useEffect(() => {
    const currentWorkspaces = new Set(listWorkspaces(timelineSections));
    if (currentWorkspaces.size === 0) return;
    setExpandedWorkspaces((prev) => {
      const filtered = prev.filter((ws) => currentWorkspaces.has(ws));
      return filtered.length === prev.length ? prev : filtered;
    });
    setLoadedCounts((prev) => {
      const kept = Object.entries(prev).filter(([ws]) => currentWorkspaces.has(ws));
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept);
    });
  }, [timelineSections]);

  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((item) => item !== workspace);
      }
      return [...prev, workspace];
    });
    // Collapsing a project drops its paging, so re-expanding starts at one page.
    setLoadedCounts((prev) => {
      if (!(workspace in prev)) return prev;
      const next = { ...prev };
      delete next[workspace];
      return next;
    });
  }, []);

  const handleShowMoreConversations = useCallback((workspace: string) => {
    setLoadedCounts((prev) => ({ ...prev, [workspace]: getProjectLoadedCount(prev, workspace) + PROJECT_PAGE_SIZE }));
  }, []);

  const handleExpandAllProjects = useCallback(() => {
    setExpandedWorkspaces(listWorkspaces(timelineSections));
    setLoadedCounts({});
    // Without this, expanding every project has no visible effect while the
    // section itself is collapsed.
    setCollapsedSections((prev) => withoutSections(prev, ['projects', 'pinned-projects']));
  }, [timelineSections]);

  const handleCollapseAllProjects = useCallback(() => {
    // Collapsing every project is not the same as collapsing the sections, so
    // `collapsedSections` is left alone.
    setExpandedWorkspaces([]);
    setLoadedCounts({});
  }, []);

  return {
    conversations,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    expandedWorkspaces,
    loadedCounts,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
    handleShowMoreConversations,
    handleExpandAllProjects,
    handleCollapseAllProjects,
    hasLoadedOnce, // ace: pinned-project orphan pruning gates on a confirmed load
    collapsedSections,
    toggleSection,
  };
};
