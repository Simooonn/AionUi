/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));
vi.mock('@/renderer/utils/model/agentLogo', () => ({ useAgentLogos: () => ({}) }));
vi.mock('@/renderer/pages/cron', () => ({ CronJobIndicator: () => null }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const conversation = {
  id: 'conv-1',
  name: 'Chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: {},
} as unknown as TChatConversation;

const baseProps: ConversationRowProps = {
  conversation,
  isGenerating: false,
  isWaitingConfirmation: false,
  hasUnread: false,
  isManualUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: false,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onArchive: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleManualUnread: vi.fn(),
  getJobStatus: () => 'none',
};

const renderRow = (props: Partial<ConversationRowProps> = {}) => render(<ConversationRow {...baseProps} {...props} />);

const nameContainer = (container: HTMLElement): HTMLElement => {
  const element = container.querySelector('.chat-history__item-name');
  if (!(element instanceof HTMLElement)) throw new Error('name container is not rendered');
  return element;
};

describe('ConversationRow DOM id', () => {
  it('keeps the c- prefix by default', () => {
    const { container } = renderRow();
    expect(container.querySelector('#c-conv-1')).not.toBeNull();
  });

  it('uses the given prefix instead', () => {
    const { container } = renderRow({ domIdPrefix: 'rc-' });
    expect(container.querySelector('#rc-conv-1')).not.toBeNull();
    expect(container.querySelector('#c-conv-1')).toBeNull();
  });
});

describe('ConversationRow project label', () => {
  it('renders the project name after the title, clearing the hover menu button', () => {
    const { container } = renderRow({ projectLabel: 'project-a' });

    const label = screen.getByTestId('conversation-project-label');
    expect(label).toHaveTextContent('project-a');
    expect(label).toHaveClass('shrink-0', 'max-w-96px', 'truncate', 'text-t-tertiary', 'group-hover:me-16px');
    expect(label).not.toHaveClass('me-16px');
    expect(nameContainer(container).lastElementChild).toBe(label);
  });

  it('keeps the margin while the menu is open', () => {
    renderRow({ projectLabel: 'project-a', menuVisible: true });

    const label = screen.getByTestId('conversation-project-label');
    expect(label).toHaveClass('me-16px');
    expect(label).not.toHaveClass('group-hover:me-16px');
  });

  it('renders no label and leaves the name container as before without one', () => {
    const { container } = renderRow();

    expect(screen.queryByTestId('conversation-project-label')).toBeNull();
    const classes = [...nameContainer(container).classList];
    expect(classes.some((name) => /(^|:)(me|pe)-16px$/.test(name))).toBe(false);
  });
});
