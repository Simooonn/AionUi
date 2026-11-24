import { CloseSmall, Edit } from '@icon-park/react';
import { Trigger } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import { AionInlineSearchInput } from '@renderer/components/base';
import TeamAgentIdentity from '../TeamAgentIdentity';

type MemberListPanelProps = {
  assistants: TeamAssistant[];
  activeSlotId: string;
  colorOf: (slot_id: string | undefined) => string;
  /** Anchor element (the member-list button). */
  children: React.ReactElement;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onSwitch: (slot_id: string) => void;
  onRename?: (slot_id: string, new_name: string) => void;
  onRemove?: (slot_id: string) => void;
  /** Disables rename/remove (team warmup in progress); switching stays enabled. */
  memberOpsDisabled?: boolean;
  panelTestId?: string;
};

/**
 * Member list popover: vertical, searchable list of all team members (including
 * ones collapsed out of the avatar strip). Reuses the TeamAssistantPickerDropdown
 * Trigger pattern — 260px wide, max-h-[min(360px,60vh)], portaled to body.
 */
const MemberListPanel: React.FC<MemberListPanelProps> = ({
  assistants,
  activeSlotId,
  colorOf,
  children,
  visible,
  onVisibleChange,
  onSwitch,
  onRename,
  onRemove,
  memberOpsDisabled = false,
  panelTestId = 'member-list-panel',
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const searchPlaceholder = t('team.memberList.searchPlaceholder', { defaultValue: 'Search members' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assistants;
    return assistants.filter((assistant) => assistant.assistant_name.toLowerCase().includes(q));
  }, [assistants, query]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setEditingId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = inputRef.current?.value ?? editValue;
    const target = assistants.find((assistant) => assistant.slot_id === editingId);
    setEditingId(null);
    if (trimmed && target && trimmed !== target.assistant_name && onRename) {
      onRename(editingId, trimmed);
    }
  }, [editingId, editValue, assistants, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename();
      } else if (e.key === 'Escape') {
        setEditingId(null);
      }
    },
    [commitRename]
  );

  const startEditing = useCallback((e: React.MouseEvent, slot_id: string, name: string) => {
    e.stopPropagation();
    setEditValue(name);
    setEditingId(slot_id);
  }, []);

  const handleSwitch = useCallback(
    (slot_id: string) => {
      onSwitch(slot_id);
      onVisibleChange(false);
    },
    [onSwitch, onVisibleChange]
  );

  return (
    <Trigger
      popupVisible={visible}
      onVisibleChange={(next) => onVisibleChange(next)}
      trigger='click'
      position='br'
      popupAlign={{ bottom: 8 }}
      getPopupContainer={() => document.body}
      popup={() => (
        <div
          data-testid={panelTestId}
          className='flex max-h-[min(360px,60vh)] w-260px min-h-0 flex-col rounded-10px border border-solid border-3 bg-dialog-fill-0 p-8px shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
          style={{ zIndex: 10020 }}
        >
          <div className='shrink-0 px-4px pb-8px pt-2px'>
            <AionInlineSearchInput
              className='w-full'
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
              data-testid={`${panelTestId}-search`}
            />
          </div>
          <div
            data-testid={`${panelTestId}-body`}
            className='min-h-0 flex-1 overflow-y-auto rounded-8px bg-dialog-fill-0'
          >
            {filtered.length === 0 ? (
              <div className='flex items-center justify-center px-12px py-12px text-center text-13px text-t-tertiary'>
                {t('team.memberList.noResults', { defaultValue: 'No members found' })}
              </div>
            ) : (
              <div className='flex flex-col gap-2px'>
                {filtered.map((assistant) => {
                  const isActive = assistant.slot_id === activeSlotId;
                  const isLeader = assistant.role === 'leader';
                  const isEditing = editingId === assistant.slot_id;
                  return (
                    <div
                      key={assistant.slot_id}
                      data-testid={`${panelTestId}-member-${assistant.slot_id}`}
                      data-active={isActive ? 'true' : 'false'}
                      className={`group flex h-40px min-w-0 cursor-pointer items-center gap-8px rounded-8px px-8px transition-colors ${
                        isActive ? 'bg-fill-2' : 'hover:bg-fill-2'
                      }`}
                      onClick={() => !isEditing && handleSwitch(assistant.slot_id)}
                      onDoubleClick={
                        onRename && !memberOpsDisabled
                          ? (e) => startEditing(e, assistant.slot_id, assistant.assistant_name)
                          : undefined
                      }
                    >
                      <span
                        className='h-24px w-3px shrink-0 rounded-full'
                        style={{ background: isActive ? colorOf(assistant.slot_id) : 'transparent' }}
                      />
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className='text-14px min-w-0 flex-1 bg-transparent border-none outline-none text-t-primary'
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <div className='min-w-0 flex-1'>
                          <TeamAgentIdentity
                            assistant_name={assistant.assistant_name}
                            assistant_backend={assistant.assistant_backend}
                            icon={assistant.icon}
                            conversation_id={assistant.conversation_id}
                            isLeader={isLeader}
                            className='!gap-6px'
                            logoClassName='w-18px h-18px object-cover rounded-full'
                            avatarClassName='w-18px h-18px rounded-full flex items-center justify-center text-11px leading-none bg-fill-2 shrink-0'
                            nameClassName='text-13px font-500 whitespace-nowrap overflow-hidden text-ellipsis'
                            nameStyle={{ color: isActive ? colorOf(assistant.slot_id) : undefined }}
                            nameTestId={`${panelTestId}-name-${assistant.slot_id}`}
                          />
                        </div>
                      )}
                      {!isEditing && onRename && !memberOpsDisabled && (
                        <span
                          data-testid={`${panelTestId}-edit-${assistant.slot_id}`}
                          className='hidden shrink-0 group-hover:flex items-center justify-center w-24px h-24px rounded-6px text-t-secondary hover:text-t-primary hover:bg-fill-3'
                          onClick={(e) => startEditing(e, assistant.slot_id, assistant.assistant_name)}
                        >
                          <Edit theme='outline' size='14' fill='currentColor' />
                        </span>
                      )}
                      {!isEditing && onRemove && !memberOpsDisabled && !isLeader && (
                        <span
                          data-testid={`${panelTestId}-remove-${assistant.slot_id}`}
                          className='hidden shrink-0 group-hover:flex items-center justify-center w-24px h-24px rounded-6px text-t-secondary hover:text-[color:var(--color-danger-6)] hover:bg-fill-3'
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(assistant.slot_id);
                          }}
                        >
                          <CloseSmall theme='outline' size='14' fill='currentColor' />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    >
      {children}
    </Trigger>
  );
};

export default MemberListPanel;
