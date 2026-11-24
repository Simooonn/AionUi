import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import MemberListPanel from '@/renderer/pages/team/components/avatarBar/MemberListPanel';

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({ assistant_name, nameTestId }: { assistant_name: string; nameTestId?: string }) => (
    <span data-testid={nameTestId}>{assistant_name}</span>
  ),
}));

vi.mock('@renderer/components/base', () => {
  const ReactModule = require('react');
  return {
    AionInlineSearchInput: ({
      value,
      onChange,
      'data-testid': testId,
    }: {
      value: string;
      onChange: (v: string) => void;
      'data-testid'?: string;
    }) =>
      ReactModule.createElement('input', {
        'data-testid': testId,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
      }),
  };
});

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    Trigger: ({
      children,
      popup,
      popupVisible,
    }: {
      children: React.ReactNode;
      popup: () => React.ReactNode;
      popupVisible?: boolean;
    }) => ReactModule.createElement('div', null, children, popupVisible ? popup() : null),
  };
});

vi.mock('@icon-park/react', () => ({
  CloseSmall: () => null,
  Edit: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const assistants: TeamAssistant[] = [
  {
    slot_id: 'lead-slot',
    conversation_id: 'lead-conv',
    role: 'leader',
    assistant_backend: 'claude',
    assistant_name: 'Alice',
    status: 'idle',
  },
  {
    slot_id: 'worker-slot',
    conversation_id: 'worker-conv',
    role: 'teammate',
    assistant_backend: 'claude',
    assistant_name: 'Bob',
    status: 'idle',
  },
  {
    slot_id: 'worker-2-slot',
    conversation_id: 'worker-2-conv',
    role: 'teammate',
    assistant_backend: 'gemini',
    assistant_name: 'Carol',
    status: 'idle',
  },
];

const renderPanel = (props: Partial<React.ComponentProps<typeof MemberListPanel>> = {}) => {
  const onSwitch = vi.fn();
  const onRename = vi.fn();
  const onRemove = vi.fn();
  const onVisibleChange = vi.fn();
  const utils = render(
    <MemberListPanel
      assistants={assistants}
      activeSlotId='lead-slot'
      colorOf={() => '#123456'}
      visible
      onVisibleChange={onVisibleChange}
      onSwitch={onSwitch}
      onRename={onRename}
      onRemove={onRemove}
      {...props}
    >
      <button data-testid='anchor'>anchor</button>
    </MemberListPanel>
  );
  return { onSwitch, onRename, onRemove, onVisibleChange, ...utils };
};

describe('MemberListPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every member including collapsed ones', () => {
    renderPanel();

    expect(screen.getByTestId('member-list-panel-member-lead-slot')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-panel-member-worker-slot')).toBeInTheDocument();
    expect(screen.getByTestId('member-list-panel-member-worker-2-slot')).toBeInTheDocument();
  });

  it('filters members by name, case-insensitively', () => {
    renderPanel();

    fireEvent.change(screen.getByTestId('member-list-panel-search'), { target: { value: 'car' } });

    expect(screen.getByTestId('member-list-panel-member-worker-2-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('member-list-panel-member-lead-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-list-panel-member-worker-slot')).not.toBeInTheDocument();
  });

  it('shows an empty state when the search matches nothing', () => {
    renderPanel();

    fireEvent.change(screen.getByTestId('member-list-panel-search'), { target: { value: 'zzz' } });

    expect(screen.getByText('team.memberList.noResults')).toBeInTheDocument();
  });

  it('switches and closes the panel when a member is clicked', () => {
    const { onSwitch, onVisibleChange } = renderPanel();

    fireEvent.click(screen.getByTestId('member-list-panel-member-worker-slot'));

    expect(onSwitch).toHaveBeenCalledWith('worker-slot');
    expect(onVisibleChange).toHaveBeenCalledWith(false);
  });

  it('marks the active member', () => {
    renderPanel();

    expect(screen.getByTestId('member-list-panel-member-lead-slot')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('member-list-panel-member-worker-slot')).toHaveAttribute('data-active', 'false');
  });

  it('does not render rename/remove affordances when member ops are disabled', () => {
    renderPanel({ memberOpsDisabled: true });

    expect(screen.queryByTestId('member-list-panel-edit-worker-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-list-panel-remove-worker-slot')).not.toBeInTheDocument();
  });
});
