import { Plus } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeammateStatus } from '@/common/types/team/teamTypes';
import { useTeamTabs } from '../hooks/TeamTabsContext';
import TeamAddMemberPopover from './memberPicker/TeamAddMemberPopover';
import MemberAvatarStrip from './avatarBar/MemberAvatarStrip';
import MemberListPanel from './avatarBar/MemberListPanel';

type TeamTabsProps = {
  onTabClick?: (slot_id: string) => void;
  /** Pending permission confirmation counts per assistant slot ID */
  pendingCounts?: Map<string, number>;
  /** 团队 warmup 进行中：禁用改成员（添加/移除/重命名）——PRD 第 7 节要求。 */
  warmingUp?: boolean;
  /** warmup 失败的成员 slot：胶囊头像标红提示，引导用户移除/换模型自救。 */
  failedSlotIds?: Set<string>;
};

type AgentStatusInfo = { slot_id: string; status: TeammateStatus; last_message?: string };

/**
 * Team member bar: avatar strip (hover shows the member name) with adaptive
 * overflow into a searchable, vertically scrollable member-list popover.
 * Rename/remove live in the popover; drag-to-reorder stays on the avatars.
 */
const TeamTabs: React.FC<TeamTabsProps> = ({ onTabClick, pendingCounts, warmingUp = false, failedSlotIds }) => {
  const { t } = useTranslation();
  const {
    assistants,
    activeSlotId,
    statusMap,
    switchTab,
    renameAssistant,
    removeAssistant,
    reorderAssistants,
    addAssistant,
    colorOf,
  } = useTeamTabs();
  // 胶囊操作（增/删/改名）只在「warmup 进行中」禁用。warmup 一旦结束——无论成功还是失败——
  // 就全部放开。后端对增删改成员本身有并发锁保证串行，前端不需要再叠一层忙碌禁用。
  const memberOpsDisabled = warmingUp;
  const [listVisible, setListVisible] = useState(false);

  const handleSwitch = useCallback(
    (slot_id: string) => {
      switchTab(slot_id);
      onTabClick?.(slot_id);
    },
    [switchTab, onTabClick]
  );

  if (assistants.length === 0) return null;

  return (
    <div
      data-testid='team-tab-bar'
      className='relative shrink-0 bg-1 border-t border-x border-b border-solid border-[color:var(--border-base)]'
    >
      <div className='relative flex items-stretch min-h-48px'>
        <div className='flex items-center gap-8px flex-1 min-w-0 py-8px px-12px'>
          <MemberAvatarStrip
            assistants={assistants}
            activeSlotId={activeSlotId}
            statusMap={statusMap as Map<string, AgentStatusInfo>}
            colorOf={colorOf}
            failedSlotIds={failedSlotIds}
            pendingCounts={pendingCounts}
            onSwitch={handleSwitch}
            onReorder={reorderAssistants}
            renderListButton={(collapsedCount) => (
              <MemberListPanel
                assistants={assistants}
                activeSlotId={activeSlotId}
                colorOf={colorOf}
                visible={listVisible}
                onVisibleChange={setListVisible}
                onSwitch={handleSwitch}
                onRename={
                  renameAssistant && !memberOpsDisabled ? (sid, name) => void renameAssistant(sid, name) : undefined
                }
                onRemove={removeAssistant && !memberOpsDisabled ? (sid) => void removeAssistant(sid) : undefined}
                memberOpsDisabled={memberOpsDisabled}
              >
                <span
                  data-testid='member-list-btn'
                  className={`flex shrink-0 items-center justify-center gap-4px rounded-full border border-solid h-24px min-w-24px px-6px text-12px font-500 transition-colors cursor-pointer ${
                    memberOpsDisabled
                      ? 'text-[color:var(--text-disabled)] cursor-not-allowed border-transparent'
                      : 'text-t-secondary hover:text-t-primary border-[color:var(--border-base)]'
                  }`}
                >
                  {collapsedCount > 0 ? `+${collapsedCount}` : '⋯'}
                </span>
              </MemberListPanel>
            )}
          />
        </div>
        {/* 固定在最右、不随列表滚动的「添加成员」；左侧一根分隔线与成员列表隔开，按钮本身无边框。 */}
        {addAssistant ? (
          <div className='flex items-center shrink-0 border-s border-solid border-[color:var(--border-base)] px-8px'>
            <TeamAddMemberPopover disabled={memberOpsDisabled}>
              <button
                type='button'
                disabled={memberOpsDisabled}
                data-testid='team-tab-add-member'
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  height: 32,
                  lineHeight: 'normal',
                }}
                className={`flex items-center gap-6px px-10px rounded-8px text-13px font-500 whitespace-nowrap transition-colors duration-150 ${
                  memberOpsDisabled
                    ? 'text-[color:var(--text-disabled)] cursor-not-allowed'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--brand)] hover:bg-[color:var(--bg-2)] cursor-pointer'
                }`}
              >
                <Plus theme='outline' size='15' fill='currentColor' className='leading-none' />
                {t('team.addMember.title', { defaultValue: 'Add member' })}
              </button>
            </TeamAddMemberPopover>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TeamTabs;
