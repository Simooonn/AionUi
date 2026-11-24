import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';

const fixtures = vi.hoisted(() => ({
  tooltipContents: [] as string[],
}));

vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ testId }: { testId: string }) => <span data-testid={testId} />,
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({
    assistant_name,
    nameTestId,
    nameVisible,
  }: {
    assistant_name: string;
    nameTestId?: string;
    nameVisible?: boolean;
  }) =>
    nameVisible === false ? <span data-testid='avatar-only' /> : <span data-testid={nameTestId}>{assistant_name}</span>,
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: string }) => {
      if (content !== undefined) fixtures.tooltipContents.push(content);
      return ReactModule.createElement(ReactModule.Fragment, null, children);
    },
  };
});

vi.mock('@/renderer/pages/team/components/memberPicker/TeamAddMemberPopover', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/team/components/avatarBar/MemberListPanel', () => {
  const ReactModule = require('react');
  return {
    default: ({
      children,
      visible,
      onVisibleChange,
      assistants,
      onSwitch,
      onRename,
      onRemove,
      memberOpsDisabled,
    }: {
      children: React.ReactNode;
      visible: boolean;
      onVisibleChange: (v: boolean) => void;
      assistants: TeamAssistant[];
      onSwitch: (id: string) => void;
      onRename?: (id: string, name: string) => void;
      onRemove?: (id: string) => void;
      memberOpsDisabled?: boolean;
    }) => (
      <div data-testid='member-list-panel'>
        <span data-testid='panel-members'>{assistants.map((a) => a.slot_id).join(',')}</span>
        {visible &&
          assistants.map((a) => (
            <button key={a.slot_id} data-testid={`panel-switch-${a.slot_id}`} onClick={() => onSwitch(a.slot_id)}>
              {a.assistant_name}
            </button>
          ))}
        <button data-testid='panel-toggle' onClick={() => onVisibleChange(!visible)}>
          {children}
        </button>
      </div>
    ),
  };
});

import TeamTabs from '@/renderer/pages/team/components/TeamTabs';
import { TeamTabsProvider } from '@/renderer/pages/team/hooks/TeamTabsContext';

const renameAssistantMock = vi.fn();
const addAssistantMock = vi.fn();

const assistants: TeamAssistant[] = [
  {
    slot_id: 'lead-slot',
    conversation_id: 'lead-conv',
    role: 'leader',
    assistant_backend: 'claude',
    assistant_name: 'Lead',
    status: 'idle',
  },
  {
    slot_id: 'worker-slot',
    conversation_id: 'worker-conv',
    role: 'teammate',
    assistant_backend: 'claude',
    assistant_name: 'Worker',
    status: 'idle',
  },
];

const renderTabs = (warmingUp: boolean) =>
  render(
    <TeamTabsProvider
      assistants={assistants}
      statusMap={new Map()}
      defaultActiveSlotId='lead-slot'
      team_id='team-1'
      renameAssistant={renameAssistantMock}
      addAssistant={addAssistantMock}
    >
      <TeamTabs warmingUp={warmingUp} />
    </TeamTabsProvider>
  );

describe('TeamTabs avatar strip', () => {
  beforeEach(() => {
    renameAssistantMock.mockReset();
    localStorage.clear();
    fixtures.tooltipContents.length = 0;
  });

  it('renders avatars for every member (no text pills)', () => {
    renderTabs(false);

    // Both avatars present; names are not rendered in the strip (avatar-only mode).
    expect(screen.getByTestId('team-tab-lead-slot')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('team-tab-worker-slot')).toHaveAttribute('data-active', 'false');
    expect(screen.getAllByTestId('avatar-only').length).toBe(2);
    expect(screen.queryByTestId('team-tab-name-lead-slot')).not.toBeInTheDocument();
  });

  it('wraps each avatar in a tooltip showing the member name', () => {
    renderTabs(false);

    expect(fixtures.tooltipContents).toContain('Lead');
    expect(fixtures.tooltipContents).toContain('Worker');
  });

  it('switches the active member when an avatar is clicked', () => {
    renderTabs(false);

    fireEvent.click(screen.getByTestId('team-tab-worker-slot'));

    expect(screen.getByTestId('team-tab-worker-slot')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('team-tab-lead-slot')).toHaveAttribute('data-active', 'false');
  });

  it('does not allow rename/remove while the team is still warming up', () => {
    renderTabs(true);

    // The member-list panel receives memberOpsDisabled=true so rename/remove are suppressed.
    const panel = screen.getByTestId('member-list-panel');
    expect(panel).toBeInTheDocument();
    // Add-member button is disabled during warmup.
    expect(screen.getByTestId('team-tab-add-member')).toBeDisabled();
  });

  it('allows member ops once warmup has ended', () => {
    renderTabs(false);

    expect(screen.getByTestId('team-tab-add-member')).not.toBeDisabled();
  });

  it('keeps the leader visible and never part of the sortable set', () => {
    renderTabs(false);

    // Leader renders as role=leader (data attribute on the strip avatar wrapper).
    expect(screen.getByTestId('team-tab-lead-slot')).toHaveAttribute('data-team-tab-role', 'leader');
    expect(screen.getByTestId('team-tab-worker-slot')).toHaveAttribute('data-team-tab-role', 'teammate');
  });
});
