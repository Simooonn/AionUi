import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import { restrictToHorizontalAxis } from '@/renderer/utils/ui/dndModifiers';
import AgentStatusBadge from '../AgentStatusBadge';
import TeamAgentIdentity from '../TeamAgentIdentity';

/** Fixed geometry used by the overflow math (keep in sync with the rendered classes). */
const AVATAR_SIZE = 22;
const AVATAR_GAP = 8;
const LIST_BUTTON_SIZE = 32;

type AgentStatusInfo = { slot_id: string; status: TeammateStatus; last_message?: string };

/**
 * Compute which assistants are visible in the avatar strip and how many are
 * collapsed into the member list. The active member is always kept visible:
 * when it falls outside the window it replaces the last visible slot and the
 * displaced member joins the collapsed set.
 */
export function computeAvatarVisibility(
  assistants: TeamAssistant[],
  activeSlotId: string,
  maxVisible: number
): { visible: TeamAssistant[]; collapsedCount: number } {
  if (assistants.length <= maxVisible) {
    return { visible: assistants, collapsedCount: 0 };
  }
  // A single slot can only show the active member.
  if (maxVisible <= 1) {
    const active = assistants.find((assistant) => assistant.slot_id === activeSlotId) ?? assistants[0];
    return { visible: [active], collapsedCount: assistants.length - 1 };
  }
  // Reserve one slot for the active member; fill the remaining window from the front.
  const windowCount = maxVisible - 1;
  const visible = assistants.slice(0, windowCount);
  const activeIndex = assistants.findIndex((assistant) => assistant.slot_id === activeSlotId);
  if (activeIndex >= windowCount) {
    visible.push(assistants[activeIndex]);
  } else if (visible.length < maxVisible) {
    visible.push(assistants[windowCount]);
  }
  return { visible, collapsedCount: assistants.length - visible.length };
}

type SortableAvatarProps = {
  assistant: TeamAssistant;
  isActive: boolean;
  isLeader: boolean;
  status: TeammateStatus;
  color: string;
  warmupFailed: boolean;
  pendingCount: number;
  onSwitch: (slot_id: string) => void;
};

const SortableAvatar: React.FC<SortableAvatarProps> = ({
  assistant,
  isActive,
  isLeader,
  status,
  color,
  warmupFailed,
  pendingCount,
  onSwitch,
}) => {
  // Leader stays fixed and never takes part in sorting.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: assistant.slot_id,
    disabled: isLeader,
  });

  return (
    <Tooltip content={assistant.assistant_name} trigger='hover' position='top' unmountOnExit popupHoverStay={false}>
      <div
        ref={setNodeRef}
        data-testid={`team-tab-${assistant.slot_id}`}
        data-team-tab-role={isLeader ? 'leader' : 'teammate'}
        data-active={isActive ? 'true' : 'false'}
        className='relative flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid transition-colors duration-150'
        style={{
          ['--mc' as string]: color,
          borderColor: isActive ? color : 'transparent',
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.72 : undefined,
          zIndex: isDragging ? 1 : undefined,
          width: AVATAR_SIZE + 2,
          height: AVATAR_SIZE + 2,
        }}
        onClick={() => onSwitch(assistant.slot_id)}
      >
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          style={{ touchAction: 'none', cursor: isLeader ? 'pointer' : 'grab' }}
          className='flex items-center justify-center'
          data-testid={`team-tab-activator-${assistant.slot_id}`}
        >
          {pendingCount > 0 && (
            <span
              data-testid={`team-tab-pending-${assistant.slot_id}`}
              className='absolute -start-1px -top-1px text-10px leading-none animate-wiggle z-10'
            >
              ‼️
            </span>
          )}
          <TeamAgentIdentity
            assistant_name={assistant.assistant_name}
            assistant_backend={assistant.assistant_backend}
            icon={assistant.icon}
            conversation_id={assistant.conversation_id}
            isLeader={isLeader}
            nameVisible={false}
            className='!gap-0'
            logoClassName={`w-22px h-22px object-cover rounded-full ${warmupFailed ? 'grayscale' : ''}`}
            avatarClassName={`w-22px h-22px rounded-full flex items-center justify-center text-12px leading-none bg-fill-2 shrink-0 ${
              warmupFailed ? 'grayscale' : ''
            }`}
            avatarOverlay={
              warmupFailed ? (
                <span
                  data-testid={`team-tab-failed-${assistant.slot_id}`}
                  className='absolute -end-1px -bottom-1px w-10px h-10px rounded-full flex items-center justify-center text-8px font-700 text-white'
                  style={{ background: 'var(--danger)', border: '1px solid var(--bg-base)' }}
                >
                  !
                </span>
              ) : (
                <AgentStatusBadge status={status} testId={`team-tab-status-${assistant.slot_id}`} />
              )
            }
          />
        </span>
      </div>
    </Tooltip>
  );
};

type MemberAvatarStripProps = {
  assistants: TeamAssistant[];
  activeSlotId: string;
  statusMap: Map<string, AgentStatusInfo>;
  colorOf: (slot_id: string | undefined) => string;
  failedSlotIds?: Set<string>;
  /** Pending permission confirmation counts per assistant slot ID. */
  pendingCounts?: Map<string, number>;
  onSwitch: (slot_id: string) => void;
  onReorder: (fromSlotId: string, toSlotId: string) => void;
  /** Renders the trailing member-list button; receives the collapsed count (0 = no overflow). */
  renderListButton: (collapsedCount: number) => React.ReactNode;
};

/**
 * Avatar-only member strip. Replaces the horizontal pill bar: each member is a
 * 22px avatar, the active member is always visible, and overflow collapses into
 * the member-list button rendered via `renderListButton`.
 */
const MemberAvatarStrip: React.FC<MemberAvatarStripProps> = ({
  assistants,
  activeSlotId,
  statusMap,
  colorOf,
  failedSlotIds,
  pendingCounts,
  onSwitch,
  onReorder,
  renderListButton,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(assistants.length);
  const prevVisibleRef = useRef(-1);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const sortableIds = useMemo(
    () => assistants.filter((assistant) => assistant.role !== 'leader').map((assistant) => assistant.slot_id),
    [assistants]
  );

  const updateOverflow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    // Skip when the container is not laid out yet (width 0) — keep the initial
    // full render instead of collapsing every member. The ResizeObserver fires
    // again once a real width is measured.
    if (width <= 0) return;
    const maxVisible = Math.max(1, Math.floor((width - LIST_BUTTON_SIZE - AVATAR_GAP) / (AVATAR_SIZE + AVATAR_GAP)));
    // Guard against feedback loops: only setState when the count actually changes.
    if (maxVisible !== prevVisibleRef.current) {
      prevVisibleRef.current = maxVisible;
      setVisibleCount(maxVisible);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(container);
    updateOverflow();
    return () => observer.disconnect();
  }, [updateOverflow]);

  const { visible, collapsedCount } = useMemo(
    () => computeAvatarVisibility(assistants, activeSlotId, visibleCount),
    [assistants, activeSlotId, visibleCount]
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      onReorder(String(active.id), String(over.id));
    },
    [onReorder]
  );

  if (assistants.length === 0) return null;

  return (
    <div ref={containerRef} className='flex min-w-0 flex-1 items-center gap-8px overflow-hidden'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {visible.map((assistant) => {
            const statusInfo = statusMap.get(assistant.slot_id);
            return (
              <SortableAvatar
                key={assistant.slot_id}
                assistant={assistant}
                isActive={assistant.slot_id === activeSlotId}
                isLeader={assistant.role === 'leader'}
                status={statusInfo?.status ?? assistant.status}
                color={colorOf(assistant.slot_id)}
                warmupFailed={failedSlotIds?.has(assistant.slot_id) ?? false}
                pendingCount={pendingCounts?.get(assistant.slot_id) ?? 0}
                onSwitch={onSwitch}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      {renderListButton(collapsedCount)}
    </div>
  );
};

export default MemberAvatarStrip;
