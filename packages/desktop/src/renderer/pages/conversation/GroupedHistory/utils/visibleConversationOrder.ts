import type { GroupedHistoryResult } from '../types';

/** Conversations revealed per project folder before the user asks for more. */
export const PROJECT_PAGE_SIZE = 5;

/** Loaded conversation count of a project folder; untracked folders show one page. */
export const getProjectLoadedCount = (loadedCounts: Record<string, number>, workspace: string): number =>
  loadedCounts[workspace] ?? PROJECT_PAGE_SIZE;

/**
 * The currently revealed prefix of a project folder's conversations. Shared by
 * the sidebar rendering and the visible-id list so both page identically.
 */
export const sliceLoadedConversations = <T>(conversations: T[], loadedCount: number): T[] =>
  conversations.slice(0, Math.max(loadedCount, 0));

/**
 * Smallest whole number of pages that reveals the conversation at the 0-based
 * `index` (index 4 -> 5, index 12 -> 15).
 */
export const loadedCountCovering = (index: number): number =>
  Math.ceil((index + 1) / PROJECT_PAGE_SIZE) * PROJECT_PAGE_SIZE;

type VisibleConversationOrderInput = GroupedHistoryResult & {
  expandedWorkspaces: string[];
  loadedCounts: Record<string, number>;
  siderCollapsed: boolean;
};

export const buildVisibleConversationIds = ({
  pinnedConversations,
  timelineSections,
  expandedWorkspaces,
  loadedCounts,
  siderCollapsed,
}: VisibleConversationOrderInput): string[] => {
  const expandedWorkspaceSet = new Set(expandedWorkspaces);
  const visibleConversationIds: string[] = [];

  pinnedConversations.forEach((conversation) => {
    visibleConversationIds.push(conversation.id);
  });

  timelineSections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === 'conversation' && item.conversation) {
        visibleConversationIds.push(item.conversation.id);
        return;
      }

      if (item.type === 'workspace' && item.workspaceGroup) {
        if (!siderCollapsed && !expandedWorkspaceSet.has(item.workspaceGroup.workspace)) {
          return;
        }

        // A collapsed sider renders every row, so paging only applies to the
        // expanded sidebar.
        const slice = siderCollapsed
          ? item.workspaceGroup.conversations
          : sliceLoadedConversations(
              item.workspaceGroup.conversations,
              getProjectLoadedCount(loadedCounts, item.workspaceGroup.workspace)
            );

        slice.forEach((conversation) => {
          visibleConversationIds.push(conversation.id);
        });
      }
    });
  });

  return visibleConversationIds;
};
