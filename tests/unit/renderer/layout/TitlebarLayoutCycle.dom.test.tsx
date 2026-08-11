import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ desktop: true, mac: false }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/conversation/test', search: '', hash: '' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: { conversation: { get: { invoke: vi.fn() } } },
}));
vi.mock('@/common/config/constants', () => ({ TEAM_MODE_ENABLED: false }));
vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/Titlebar/MobileConversationBrand', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => <div data-testid='window-controls' />,
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/context/NavigationHistoryContext', () => ({
  useNavigationHistory: () => null,
}));
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: vi.fn() }),
}));
vi.mock('@/renderer/services/feedback/resolveFeedbackModule', () => ({
  resolveFeedbackModule: () => 'conversation-session',
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platform.desktop,
  isMacOS: () => platform.mac,
}));

import Titlebar from '@/renderer/components/layout/Titlebar';
import { CHAT_STATE_EVENT } from '@/renderer/utils/workspace/chatPanelEvents';
import { WORKSPACE_STATE_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

/**
 * The titlebar's workspace entry is the single layout-cycle control (both →
 * chat-only → workspace-only). It only appears once ChatLayout has announced
 * `controlAvailable`, so every case has to publish that first.
 */
const announceChatControl = (collapsed = false, controlAvailable = true) => {
  act(() => {
    window.dispatchEvent(new CustomEvent(CHAT_STATE_EVENT, { detail: { collapsed, controlAvailable } }));
  });
};

describe('Titlebar layout cycle control', () => {
  beforeEach(() => {
    platform.desktop = true;
    platform.mac = false;
  });

  it('places the Windows layout control directly after Bug Report', () => {
    render(<Titlebar workspaceAvailable />);
    announceChatControl();

    const report = screen.getByRole('button', { name: 'conversation.welcome.quickActionFeedback' });
    // Initial state is chat-only (workspace collapsed), so the next layout is workspace-only.
    const layoutControl = screen.getByRole('button', { name: 'common.layoutWorkspaceOnly' });

    expect(report.nextElementSibling).toBe(layoutControl);
    expect(layoutControl.nextElementSibling).toBe(screen.getByTestId('window-controls'));
  });

  it.each([
    { runtime: 'macOS desktop', desktop: true, mac: true },
    { runtime: 'WebUI', desktop: false, mac: false },
  ])('keeps the layout control after Bug Report on $runtime', ({ desktop, mac }) => {
    platform.desktop = desktop;
    platform.mac = mac;
    render(<Titlebar workspaceAvailable />);
    announceChatControl();

    const report = screen.getByRole('button', { name: 'conversation.welcome.quickActionFeedback' });
    const layoutControl = screen.getByRole('button', { name: 'common.layoutWorkspaceOnly' });

    expect(report.nextElementSibling).toBe(layoutControl);
    expect(screen.queryByTestId('window-controls')).not.toBeInTheDocument();
  });

  it('updates the layout action when the workspace panel becomes expanded', () => {
    render(<Titlebar workspaceAvailable />);
    announceChatControl();

    act(() => {
      window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_EVENT, { detail: { collapsed: false } }));
    });

    // Both panels open → the next layout in the cycle is chat-only.
    expect(screen.getByRole('button', { name: 'common.layoutChatOnly' })).toBeInTheDocument();
  });

  it('omits the layout control when no workspace is available', () => {
    render(<Titlebar workspaceAvailable={false} />);
    announceChatControl();

    expect(screen.queryByRole('button', { name: 'common.layoutWorkspaceOnly' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.layoutChatOnly' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.layoutBothPanels' })).not.toBeInTheDocument();
  });

  it('omits the layout control until ChatLayout reports the control is available', () => {
    render(<Titlebar workspaceAvailable />);

    expect(screen.queryByRole('button', { name: 'common.layoutWorkspaceOnly' })).not.toBeInTheDocument();

    announceChatControl();

    expect(screen.getByRole('button', { name: 'common.layoutWorkspaceOnly' })).toBeInTheDocument();
  });
});
