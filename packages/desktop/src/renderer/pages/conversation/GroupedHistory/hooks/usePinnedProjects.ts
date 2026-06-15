/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useState } from 'react';

const PINNED_PROJECTS_KEY = 'sidebar.pinnedProjects';

/**
 * Pinned-project membership lives in a single config value (`sidebar.pinnedProjects`),
 * an ordered array of workspace paths where the array index IS the display order.
 * Projects are not a stored entity — they are derived by grouping conversations by
 * workspace — so the pin set is the authoritative source for membership only; the
 * folder contents still come from the conversation list.
 *
 * Two independent async timelines exist (config via `whenReady`, conversations via
 * IPC); "pinned but not yet loaded / temporarily empty" is a legitimate state, so
 * orphan cleanup is gated on a confirmed conversation-load signal (see `pruneOrphans`).
 */
export const usePinnedProjects = () => {
  const [pinnedList, setPinnedList] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    // Seed only after the config cache is populated, otherwise `get` returns
    // undefined on a cold start and the pinned section flashes empty.
    void configService.whenReady().then(() => {
      if (!mounted) return;
      setPinnedList(configService.get(PINNED_PROJECTS_KEY) ?? []);
    });
    // In-process reactivity: fires on any local `set` of this key (this hook's
    // own writes included), so the UI updates immediately.
    const unsubscribe = configService.subscribe(PINNED_PROJECTS_KEY, (value) => {
      setPinnedList(Array.isArray(value) ? (value as string[]) : []);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const pinnedSet = useMemo(() => new Set(pinnedList), [pinnedList]);

  const isPinned = useCallback((workspace: string) => pinnedSet.has(workspace), [pinnedSet]);

  // Read the latest value from the config cache (not the closed-over state) so
  // rapid toggle/reorder while a prior `set` PUT is in flight stay consistent.
  const togglePin = useCallback(async (workspace: string) => {
    const current = configService.get(PINNED_PROJECTS_KEY) ?? [];
    const next = current.includes(workspace) ? current.filter((w) => w !== workspace) : [...current, workspace];
    await configService.set(PINNED_PROJECTS_KEY, next);
  }, []);

  const reorder = useCallback(async (fromWorkspace: string, toWorkspace: string) => {
    const current = configService.get(PINNED_PROJECTS_KEY) ?? [];
    const from = current.indexOf(fromWorkspace);
    const to = current.indexOf(toWorkspace);
    if (from === -1 || to === -1 || from === to) return;
    await configService.set(PINNED_PROJECTS_KEY, arrayMove(current, from, to));
  }, []);

  /**
   * Drop pinned entries whose workspace no longer exists in any project group
   * (all its conversations were deleted). MUST only run once conversations have
   * loaded, and never writes back when nothing changed.
   */
  const pruneOrphans = useCallback(async (existingWorkspaces: Set<string>, hasLoadedOnce: boolean) => {
    if (!hasLoadedOnce) return;
    const current = configService.get(PINNED_PROJECTS_KEY) ?? [];
    if (current.length === 0) return;
    const next = current.filter((workspace) => existingWorkspaces.has(workspace));
    if (next.length !== current.length) {
      await configService.set(PINNED_PROJECTS_KEY, next);
    }
  }, []);

  return { pinnedList, pinnedSet, isPinned, togglePin, reorder, pruneOrphans };
};

type PinnedProjectGroup = { workspace: string; displayName: string };

type UsePinnedProjectDragAndDropParams = {
  pinnedProjectGroups: PinnedProjectGroup[];
  reorder: (fromWorkspace: string, toWorkspace: string) => Promise<void>;
  collapsed: boolean;
  batchMode: boolean;
};

/**
 * Self-contained drag-and-drop for the pinned-projects section. Persists order
 * exclusively through `reorder` (which writes the config key) — it MUST NOT touch
 * conversation persistence. Mirrors the conversation pinned section's enable gate.
 */
export const usePinnedProjectDragAndDrop = ({
  pinnedProjectGroups,
  reorder,
  collapsed,
  batchMode,
}: UsePinnedProjectDragAndDropParams) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [activeId, setActiveId] = useState<string | null>(null);

  const isDragEnabled = !batchMode && !collapsed && !isMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;
      await reorder(String(active.id), String(over.id));
    },
    [reorder]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeGroup = activeId ? (pinnedProjectGroups.find((g) => g.workspace === activeId) ?? null) : null;

  return { sensors, activeId, activeGroup, handleDragStart, handleDragEnd, handleDragCancel, isDragEnabled };
};
