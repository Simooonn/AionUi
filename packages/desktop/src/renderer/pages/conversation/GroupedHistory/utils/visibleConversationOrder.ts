import type { GroupedHistoryResult, WorkspaceGroup } from '../types';

/** Rows revealed initially, then on each request for more. */
export const INITIAL_PAGE_SIZE = 5;
export const PAGE_STEP = 10;

/** Loaded conversation count of a project folder; untracked folders show one page. */
export const getProjectLoadedCount = (loadedCounts: Record<string, number>, workspace: string): number =>
  loadedCounts[workspace] ?? INITIAL_PAGE_SIZE;

/** The loaded prefix shared by recent rows and project conversations. */
export const sliceLoadedConversations = <T>(conversations: T[], loadedCount: number): T[] =>
  conversations.slice(0, Math.max(loadedCount, 0));

/** Smallest loaded count covering a zero-based index: 4 -> 5, 5 -> 15, 15 -> 25. */
export const loadedCountCovering = (index: number): number =>
  index < INITIAL_PAGE_SIZE
    ? INITIAL_PAGE_SIZE
    : INITIAL_PAGE_SIZE + Math.ceil((index + 1 - INITIAL_PAGE_SIZE) / PAGE_STEP) * PAGE_STEP;

/** Section folds apply even when the sider is narrow and its labels are hidden. */
export const isSectionOpen = (collapsedSections: ReadonlySet<string>, key: string): boolean =>
  !collapsedSections.has(key);

/** Pinned projects must be excluded before applying the normal-project window. */
export const sliceVisibleProjects = <T>(projects: T[], loadedCount: number, siderCollapsed: boolean): T[] =>
  siderCollapsed ? projects : projects.slice(0, Math.max(loadedCount, 0));

/** The same project expansion and paging predicate drives rendering and Ctrl+Tab. */
export const getVisibleProjectConversations = (
  group: Pick<WorkspaceGroup, 'workspace' | 'conversations'>,
  expandedWorkspaces: string[],
  loadedCounts: Record<string, number>,
  siderCollapsed: boolean
): WorkspaceGroup['conversations'] => {
  if (siderCollapsed) return group.conversations;
  if (!expandedWorkspaces.includes(group.workspace)) return [];
  return sliceLoadedConversations(group.conversations, getProjectLoadedCount(loadedCounts, group.workspace));
};

type VisibleConversationOrderInput = GroupedHistoryResult & {
  expandedWorkspaces: string[];
  loadedCounts: Record<string, number>;
  collapsedSections: string[];
  pinnedProjects: string[];
  projectListLoadedCount: number;
  siderCollapsed: boolean;
};

export const buildVisibleConversationIds = ({
  pinnedConversations,
  timelineSections,
  expandedWorkspaces,
  loadedCounts,
  collapsedSections,
  pinnedProjects,
  projectListLoadedCount,
  siderCollapsed,
}: VisibleConversationOrderInput): string[] => {
  const collapsed = new Set(collapsedSections);
  const pinned = new Set(pinnedProjects);
  const unpinnedGroups = timelineSections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.type === 'workspace' && item.workspaceGroup && !pinned.has(item.workspaceGroup.workspace)
        ? [item.workspaceGroup]
        : []
    )
  );
  const visibleProjects = new Set(
    sliceVisibleProjects(unpinnedGroups, projectListLoadedCount, siderCollapsed).map((group) => group.workspace)
  );
  const visibleConversationIds = new Set<string>();

  if (isSectionOpen(collapsed, 'pinned')) {
    pinnedConversations.forEach((conversation) => visibleConversationIds.add(conversation.id));
  }

  // Preserve the canonical order (pinned, then timeline); recent copies never enter it.
  timelineSections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === 'conversation' && item.conversation) {
        if (isSectionOpen(collapsed, 'conversations')) visibleConversationIds.add(item.conversation.id);
        return;
      }

      if (item.type === 'workspace' && item.workspaceGroup) {
        const group = item.workspaceGroup;
        const projectSection = pinned.has(group.workspace) ? 'pinned-projects' : 'projects';
        if (!isSectionOpen(collapsed, projectSection)) return;
        if (!pinned.has(group.workspace) && !visibleProjects.has(group.workspace)) return;
        getVisibleProjectConversations(group, expandedWorkspaces, loadedCounts, siderCollapsed).forEach(
          (conversation) => {
            visibleConversationIds.add(conversation.id);
          }
        );
      }
    });
  });

  return [...visibleConversationIds];
};
