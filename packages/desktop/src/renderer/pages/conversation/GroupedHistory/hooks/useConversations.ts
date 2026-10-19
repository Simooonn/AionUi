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
import {
  getProjectLoadedCount,
  loadedCountCovering,
  INITIAL_PAGE_SIZE,
  PAGE_STEP,
} from '../utils/visibleConversationOrder';
// ace:start recent-section
import { RECENT_ROW_ID_PREFIX, RECENT_SECTION_KEY } from '../utils/recentConversations';
// ace:end
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

// ace:start recent-section — the legacy reveal's double-RAF scroll, extracted
// unchanged so the recent-section path can reuse it
/**
 * Scroll a sidebar row into view once newly expanded content (and async
 * siblings like CronJobSiderSection) has rendered — hence the double RAF.
 * Returns the cancel for the effect cleanup.
 */
const scrollIntoViewAfterPaint = (elementId: string): (() => void) => {
  let cancelled = false;
  let innerRafId: number;
  const outerRafId = requestAnimationFrame(() => {
    innerRafId = requestAnimationFrame(() => {
      if (cancelled) return;
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(outerRafId);
    cancelAnimationFrame(innerRafId);
  };
};

/** Whether the element's whole box sits inside its scroll viewport; a zero-height box never counts. */
const isFullyVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0) return false;
  let viewport: { top: number; bottom: number } = { top: 0, bottom: window.innerHeight };
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      viewport = parent.getBoundingClientRect();
      break;
    }
  }
  return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
};

/**
 * How to reveal the active conversation. Only a conversation the recent section
 * currently renders leaves the legacy expand-and-scroll path: with any of its
 * rows already in view nothing moves; with its own row rendered the legacy path
 * scrolls to that row; otherwise only the recent row is scrolled to. Either way
 * the recent section never expands a project.
 *
 * Reads the committed DOM, so the recent rows must be rendered by the same
 * component that calls this hook (they are then committed before the effect runs).
 */
const resolveRevealPath = (id: string): 'legacy' | 'none' | 'recent' => {
  const recentRow = document.getElementById(RECENT_ROW_ID_PREFIX + id);
  if (!recentRow) return 'legacy';
  const row = document.getElementById('c-' + id);
  if (isFullyVisible(recentRow) || (row !== null && isFullyVisible(row))) return 'none';
  return row ? 'legacy' : 'recent';
};
// ace:end

const EMPTY_PINNED_PROJECTS: string[] = [];

export const useConversations = ({
  pinnedProjects = EMPTY_PINNED_PROJECTS,
  pinnedProjectsReady = true,
}: { pinnedProjects?: string[]; pinnedProjectsReady?: boolean } = {}) => {
  // Projects start collapsed on every launch and each one at the default page
  // size — neither is persisted (spec AC7).
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>([]);
  const [loadedCounts, setLoadedCounts] = useState<Record<string, number>>({});
  const [projectListLoadedCount, setProjectListLoadedCount] = useState(INITIAL_PAGE_SIZE);
  // ace:start recent-section — revealed rows of the recent section; not persisted
  const [recentLoadedCount, setRecentLoadedCount] = useState(INITIAL_PAGE_SIZE);
  // ace:end
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
    activityStatus,
    isConversationListComplete,
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
    // ace:start recent-section — folding the recent section either way restarts it at one page
    if (key === RECENT_SECTION_KEY) setRecentLoadedCount(INITIAL_PAGE_SIZE);
    if (key === 'projects') setProjectListLoadedCount(INITIAL_PAGE_SIZE);
    // ace:end
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

    // ace:start recent-section
    const revealPath = resolveRevealPath(id);
    if (revealPath !== 'legacy') {
      revealedIdRef.current = id;
      return revealPath === 'recent' ? scrollIntoViewAfterPaint(RECENT_ROW_ID_PREFIX + id) : undefined;
    }
    // ace:end

    // Do not classify a pinned project as ordinary before async config hydration.
    if (!pinnedProjectsReady) return;
    const location = locateConversation(id, pinnedConversations, timelineSections);
    if (!location) return; // data not loaded yet; effect re-runs when it arrives
    revealedIdRef.current = id;

    // Reopen only the section that actually owns the canonical row.
    const section =
      location.workspace && pinnedProjects.includes(location.workspace) ? 'pinned-projects' : location.section;
    setCollapsedSections((prev) => withoutSections(prev, [section]));
    // Expand the containing project folder if collapsed, and reveal enough
    // pages to include the target row.
    if (location.workspace) {
      const workspace = location.workspace;
      if (!pinnedProjects.includes(workspace)) {
        const rank = listWorkspaces(timelineSections)
          .filter((item) => !pinnedProjects.includes(item))
          .indexOf(workspace);
        setProjectListLoadedCount((count) => Math.max(count, loadedCountCovering(rank)));
      }
      setExpandedWorkspaces((prev) => (prev.includes(workspace) ? prev : [...prev, workspace]));
      const targetIndex = location.indexInWorkspace ?? 0;
      setLoadedCounts((prev) => {
        // Monotonic: a later, shorter list must not shrink what is revealed.
        const needed = loadedCountCovering(targetIndex);
        const current = getProjectLoadedCount(prev, workspace);
        return needed <= current ? prev : { ...prev, [workspace]: needed };
      });
    }

    // ace:start recent-section — same double-RAF scroll as before, via the shared helper
    return scrollIntoViewAfterPaint('c-' + id);
    // ace:end
  }, [
    clearCompletionUnread,
    clearManualUnread,
    id,
    setActiveConversation,
    pinnedConversations,
    timelineSections,
    pinnedProjects,
    pinnedProjectsReady,
  ]);

  // Publish the project-view snapshot to the subscribers (nothing is persisted).
  useEffect(() => {
    dispatchWorkspaceExpansionChange({
      expandedWorkspaces,
      loadedCounts,
      collapsedSections: [...collapsedSections],
      pinnedProjects,
      projectListLoadedCount,
    });
  }, [expandedWorkspaces, loadedCounts, collapsedSections, pinnedProjects, projectListLoadedCount]);

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
    setLoadedCounts((prev) => ({ ...prev, [workspace]: getProjectLoadedCount(prev, workspace) + PAGE_STEP }));
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

  // ace:start recent-section
  const handleShowMoreRecent = useCallback(() => {
    setRecentLoadedCount((count) => count + PAGE_STEP);
  }, []);
  // ace:end

  const handleShowMoreProjects = useCallback(() => {
    setProjectListLoadedCount((count) => count + PAGE_STEP);
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
    hasLoadedOnce,
    activityStatus,
    isConversationListComplete,
    projectListLoadedCount,
    handleShowMoreProjects,
    collapsedSections,
    toggleSection,
    // ace:start recent-section
    recentLoadedCount,
    handleShowMoreRecent,
    // ace:end
  };
};
