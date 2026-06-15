/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
// ace:start gray out stale-workspace projects
import { useStaleWorkspaces } from '@/renderer/ace/useStaleWorkspaces';
// ace:end
import AionModal from '@/renderer/components/base/AionModal';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Input, Menu, Message, Modal, Tooltip } from '@arco-design/web-react';
import { Delete, FolderOpen, MoreOne, Pin, Plus, Refresh, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import DragOverlayContent from './DragOverlayContent';
import SortableConversationRow from './SortableConversationRow';
import SortablePinnedProject from './SortablePinnedProject';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExport } from './hooks/useExport';
import { usePinnedProjects, usePinnedProjectDragAndDrop } from './hooks/usePinnedProjects';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
  afterPinnedContent,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();

  // Persist section collapsed state across reloads.
  const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const SectionLabel = useCallback(
    ({ sectionKey, label, trailing }: { sectionKey: string; label: string; trailing?: React.ReactNode }) => {
      const isCollapsed = collapsedSections.has(sectionKey);
      return (
        <div
          className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
          onClick={() => toggleSection(sectionKey)}
        >
          <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
            {label}
          </span>
          <span className='ml-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
            <Right
              theme='outline'
              size={12}
              className={classNames('transition-transform duration-150', { 'rotate-90': !isCollapsed })}
            />
          </span>
          {trailing && (
            <div className='ml-auto' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      );
    },
    [collapsedSections, toggleSection]
  );

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
    hasLoadedOnce,
  } = useConversations();

  const {
    pinnedSet,
    pinnedList,
    isPinned,
    togglePin,
    reorder: reorderPinnedProjects,
    pruneOrphans,
  } = usePinnedProjects();

  const handleToggleProjectPin = useCallback(
    async (workspace: string) => {
      try {
        await togglePin(workspace);
      } catch (error) {
        console.error('Failed to toggle project pin:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [togglePin, t]
  );

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleRemoveProject,
    removeProjectTarget,
    removeProjectLoading,
    handleRemoveProjectCancel,
    handleRemoveProjectConfirm,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
  });

  const {
    exportTask,
    exportModalVisible,
    exportTargetPath,
    exportModalLoading,
    showExportDirectorySelector,
    setShowExportDirectorySelector,
    closeExportModal,
    handleSelectExportDirectoryFromModal,
    handleSelectExportFolder,
    // handleExportConversation / handleBatchExport are intentionally not
    // destructured: their UI entries are disabled (kanban #14). The useExport
    // hook and its underlying logic stay intact for a future re-enable.
    handleConfirmExport,
  } = useExport({
    conversations,
    selectedConversationIds,
    setSelectedConversationIds,
    onBatchModeChange,
  });

  const { sensors, activeId, activeConversation, handleDragStart, handleDragEnd, handleDragCancel, isDragEnabled } =
    useDragAndDrop({
      pinnedConversations,
      batchMode,
      collapsed,
    });

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      hasCompletionUnread: hasCompletionUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onDelete: handleDeleteClick,
      // Export UI entry intentionally disabled (kanban #14): omit onExport so
      // ConversationRow's `{onExport && ...}` guard hides the menu item. The
      // underlying handleExportConversation logic from useExport is kept for a
      // future per-platform re-enable.
      onTogglePin: handleTogglePin,
      getJobStatus,
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      hasCompletionUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleDeleteClick,
      handleTogglePin,
      getJobStatus,
    ]
  );

  const renderConversation = (conversation: TChatConversation, dimIcon = false, stale = false) => {
    const rowProps = getConversationRowProps(conversation);
    // ace:start pass stale so rows of a missing-workspace project gray out
    return <ConversationRow key={conversation.id} {...rowProps} dimIcon={dimIcon} stale={stale} />;
    // ace:end
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below.
  // Projects section: collect all workspace groups across timeline sections, ordered by recency.
  const projectGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ workspace: string; displayName: string; conversations: TChatConversation[] }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push({
            workspace: item.workspaceGroup.workspace,
            displayName: item.workspaceGroup.display_name,
            conversations: item.workspaceGroup.conversations,
          });
        }
      }
    }
    return groups;
  }, [timelineSections]);

  // ace:start gray out projects whose workspace directory no longer exists; recheck() + checking for the refresh button
  const {
    stale: staleWorkspaces,
    recheck: recheckWorkspaces,
    checking: workspacesChecking,
  } = useStaleWorkspaces(projectGroups.map((g) => g.workspace));
  // ace:end

  // Split projects into pinned (config-driven, ordered by the pin array index) and the rest.
  const pinnedProjectGroups = useMemo(() => {
    const byWorkspace = new Map(projectGroups.map((g) => [g.workspace, g]));
    return pinnedList
      .map((ws) => byWorkspace.get(ws))
      .filter((g): g is (typeof projectGroups)[number] => g !== undefined);
  }, [projectGroups, pinnedList]);

  const unpinnedProjectGroups = useMemo(
    () => projectGroups.filter((g) => !pinnedSet.has(g.workspace)),
    [projectGroups, pinnedSet]
  );

  const pinnedProjectIds = useMemo(() => pinnedProjectGroups.map((g) => g.workspace), [pinnedProjectGroups]);

  // Prune pinned entries whose workspace has no conversations left (orphan). Gated
  // on hasLoadedOnce so the empty pre-load state never wipes existing pins.
  useEffect(() => {
    const existing = new Set(projectGroups.map((g) => g.workspace));
    void pruneOrphans(existing, hasLoadedOnce);
  }, [projectGroups, hasLoadedOnce, pruneOrphans]);

  const {
    sensors: pinnedProjectSensors,
    activeId: activePinnedProjectId,
    activeGroup: activePinnedProjectGroup,
    handleDragStart: handlePinnedProjectDragStart,
    handleDragEnd: handlePinnedProjectDragEnd,
    handleDragCancel: handlePinnedProjectDragCancel,
    isDragEnabled: isPinnedProjectDragEnabled,
  } = usePinnedProjectDragAndDrop({
    pinnedProjectGroups,
    reorder: reorderPinnedProjects,
    collapsed,
    batchMode,
  });

  // Conversations section: keep timeline grouping (today/yesterday/...) but only show non-workspace conversations.
  const conversationOnlySections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.type === 'conversation' && item.conversation),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  // Render a single project folder. Shared by the pinned-projects section and the
  // regular projects section so both look and behave identically.
  const renderProjectGroup = (group: {
    workspace: string;
    displayName: string;
    conversations: TChatConversation[];
  }) => {
    // ace:start a project whose workspace dir is gone grays its whole subtree
    const isStale = staleWorkspaces.has(group.workspace);
    // ace:end
    const pinned = isPinned(group.workspace);
    const projectMenu = (
      <Menu
        onClickMenuItem={(key) => {
          if (key === 'pin') {
            void handleToggleProjectPin(group.workspace);
          } else if (key === 'remove') {
            handleRemoveProject(group.displayName, group.conversations);
          }
        }}
      >
        <Menu.Item key='pin'>
          <span className='flex items-center gap-8px'>
            <Pin theme='outline' size='14' />
            {pinned ? t('conversation.history.unpinProject') : t('conversation.history.pinProject')}
          </span>
        </Menu.Item>
        <Menu.Item key='remove' className='!text-[rgb(var(--danger-6))]'>
          <span className='flex items-center gap-8px'>
            <Delete theme='outline' size='14' />
            {t('conversation.history.removeProject')}
          </span>
        </Menu.Item>
      </Menu>
    );
    return (
      <WorkspaceCollapse
        expanded={expandedWorkspaces.includes(group.workspace)}
        onToggle={() => handleToggleWorkspace(group.workspace)}
        siderCollapsed={collapsed}
        // ace:start gray the folder icon for a stale project
        dimmed={isStale}
        // ace:end
        header={
          // ace:start gray displayName when workspace dir is missing
          <span
            className={classNames(
              'text-14px font-[500] truncate flex-1 min-w-0',
              isStale ? 'text-t-disabled' : 'text-t-primary'
            )}
            title={isStale ? group.workspace : undefined}
          >
            {group.displayName}
          </span>
          // ace:end
        }
        trailing={
          <span className='flex items-center gap-6px'>
            <Tooltip content={t('conversation.history.newConversationInProject')} position='top'>
              <span
                role='button'
                tabIndex={isStale ? -1 : 0}
                aria-label={t('conversation.history.newConversationInProject')}
                // ace:start disable "new conversation" on a stale project (its dir is gone)
                aria-disabled={isStale}
                className={classNames(
                  'flex-center transition-colors size-20px rd-4px sider-action-btn',
                  isMobile ? 'flex' : 'hidden group-hover:flex',
                  isStale
                    ? 'opacity-40 cursor-not-allowed text-t-disabled'
                    : 'cursor-pointer text-t-secondary hover:text-t-primary'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isStale) return;
                  void navigate('/guid', { state: { workspace: group.workspace } });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isStale) return;
                    void navigate('/guid', { state: { workspace: group.workspace } });
                  }
                }}
                // ace:end
              >
                <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Tooltip>
            <Dropdown
              droplist={projectMenu}
              trigger='click'
              position='br'
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                aria-label='Project actions'
                className={classNames(
                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                  isMobile ? 'flex' : 'hidden group-hover:flex'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
              </span>
            </Dropdown>
          </span>
        }
      >
        <div className={classNames('flex flex-col min-w-0', { 'mt-1px': !collapsed })}>
          {/* ace:start gray child rows of a stale project */}
          {group.conversations.map((conversation) => renderConversation(conversation, true, isStale))}
          {/* ace:end */}
        </div>
      </WorkspaceCollapse>
    );
  };

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <>
        {afterPinnedContent}
        <div className='py-48px flex-center'>
          <Empty description={t('conversation.history.noHistory')} />
        </div>
      </>
    );
  }

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        visible={exportModalVisible}
        title={t('conversation.history.exportDialogTitle')}
        onCancel={closeExportModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='conversation-export-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>
            {exportTask?.mode === 'batch'
              ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversation_ids.length })
              : t('conversation.history.exportDialogSingleDescription')}
          </div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span
                className='text-14px overflow-hidden text-ellipsis whitespace-nowrap'
                style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
              >
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <span>💡</span>
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal
        visible={showExportDirectorySelector}
        onConfirm={handleSelectExportDirectoryFromModal}
        onCancel={() => setShowExportDirectorySelector(false)}
      />

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            {/* Batch export UI entry intentionally disabled (kanban #14): the
                button is removed so select-all + delete share the two columns.
                handleBatchExport from useExport is kept for a future re-enable. */}
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                onClick={handleBatchDelete}
              >
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 移除项目确认弹窗 — 使用项目自家 AionModal + 圆角线框按钮（红色危险态） */}
      <AionModal
        visible={removeProjectTarget !== null}
        style={{ width: '400px' }}
        header={{
          title: t('conversation.history.removeProjectTitle'),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={handleRemoveProjectCancel}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleRemoveProjectCancel}
              disabled={removeProjectLoading}
            >
              {t('conversation.history.cancelDelete')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--danger-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--danger-6))',
                cursor: removeProjectLoading ? 'not-allowed' : 'pointer',
                opacity: removeProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!removeProjectLoading) {
                  event.currentTarget.style.backgroundColor = 'rgba(var(--danger-6), 0.08)';
                }
              }}
              onMouseLeave={(event) => {
                if (!removeProjectLoading) event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => void handleRemoveProjectConfirm()}
              disabled={removeProjectLoading}
            >
              {removeProjectLoading ? t('conversation.history.deleting') : t('conversation.history.confirmDelete')}
            </button>
          </div>
        }
      >
        <div className='text-14px leading-22px text-t-secondary'>
          {t('conversation.history.removeProjectConfirm', {
            name: removeProjectTarget?.name ?? '',
            count: removeProjectTarget?.conversations.length ?? 0,
          })}
        </div>
      </AionModal>

      <div>
        {/* L1: Pinned section */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {pinnedConversations.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeId && activeConversation ? <DragOverlayContent conversation={activeConversation} /> : null}
          </DragOverlay>
        </DndContext>

        {/* L1: Pinned projects section — between pinned conversations and the Team/Cron slot */}
        {pinnedProjectGroups.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel sectionKey='pinned-projects' label={t('conversation.history.pinnedProjectsSection')} />
            )}
            {!collapsedSections.has('pinned-projects') && (
              <DndContext
                sensors={pinnedProjectSensors}
                collisionDetection={closestCenter}
                onDragStart={handlePinnedProjectDragStart}
                onDragEnd={handlePinnedProjectDragEnd}
                onDragCancel={handlePinnedProjectDragCancel}
              >
                <SortableContext items={pinnedProjectIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedProjectGroups.map((group) =>
                      isPinnedProjectDragEnabled ? (
                        <SortablePinnedProject key={group.workspace} workspace={group.workspace}>
                          {renderProjectGroup(group)}
                        </SortablePinnedProject>
                      ) : (
                        <div key={group.workspace} className='min-w-0'>
                          {renderProjectGroup(group)}
                        </div>
                      )
                    )}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activePinnedProjectId && activePinnedProjectGroup ? (
                    <div className='px-10px py-6px rd-8px bg-fill-2 text-14px font-[500] text-t-primary truncate max-w-240px'>
                      {activePinnedProjectGroup.displayName}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        )}

        {/* Slot 由父级（Sider）填入：例如 Team / CronJob sections，位于「置顶」之后、「项目」之前 */}
        {afterPinnedContent}

        {/* L1: Projects section — workspace folders, peer to conversations (pinned ones excluded) */}
        {unpinnedProjectGroups.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel
                sectionKey='projects'
                label={t('conversation.history.projectsSection')}
                // ace:start refresh button: re-check all project dirs without restarting the app
                trailing={
                  <Tooltip content={t('conversation.history.refreshProjects')} position='top'>
                    <span
                      role='button'
                      tabIndex={workspacesChecking ? -1 : 0}
                      aria-label={t('conversation.history.refreshProjects')}
                      aria-disabled={workspacesChecking}
                      className={classNames(
                        'flex-center transition-colors size-20px rd-4px sider-action-btn group-hover/label:opacity-100',
                        // keep the spinner visible while checking even without label hover
                        workspacesChecking
                          ? 'opacity-100 cursor-default text-t-tertiary'
                          : 'opacity-0 cursor-pointer text-t-tertiary hover:text-t-primary'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (workspacesChecking) return;
                        recheckWorkspaces();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (workspacesChecking) return;
                          recheckWorkspaces();
                        }
                      }}
                    >
                      <Refresh
                        theme='outline'
                        size='14'
                        fill='currentColor'
                        className={classNames('block leading-none', { 'animate-spin': workspacesChecking })}
                      />
                    </span>
                  </Tooltip>
                }
                // ace:end
              />
            )}
            {!collapsedSections.has('projects') &&
              unpinnedProjectGroups.map((group) => (
                <div key={group.workspace} className='min-w-0'>
                  {renderProjectGroup(group)}
                </div>
              ))}
          </div>
        )}

        {/* L1: Conversations section — peer to projects, internally split by timeline */}
        {conversationOnlySections.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel sectionKey='conversations' label={t('conversation.history.conversationsSection')} />
            )}
            {!collapsedSections.has('conversations') &&
              conversationOnlySections.map((section) => (
                <div key={section.timeline} className='min-w-0'>
                  {!collapsed && conversationOnlySections.length > 1 && (
                    <div className='flex items-center px-16px h-24px select-none'>
                      <span className='text-12px text-t-secondary font-[500] leading-none'>{section.timeline}</span>
                    </div>
                  )}
                  {section.items.map((item) =>
                    item.type === 'conversation' && item.conversation ? renderConversation(item.conversation) : null
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;
