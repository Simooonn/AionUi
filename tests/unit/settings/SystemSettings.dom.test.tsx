/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemSettings from '@/renderer/pages/settings/SystemSettings';

const mockUseLocation = vi.fn();

vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent', () => ({
  default: () => <div data-testid='system-modal-content'>SystemModalContent</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/AboutModalContent', () => ({
  default: () => <div data-testid='about-modal-content'>AboutModalContent</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children, contentClassName }: { children: React.ReactNode; contentClassName?: string }) => (
    <div data-testid='settings-page-wrapper' {...(contentClassName ? { 'data-content-class': contentClassName } : {})}>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/ace/settings/OpenWithSettings', () => ({
  default: () => <div data-testid='open-with-settings'>OpenWithSettings</div>,
}));

describe('SystemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SystemModalContent when pathname is not /settings/about', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/system' });
    render(<SystemSettings />);
    expect(screen.getByTestId('system-modal-content')).toBeInTheDocument();
    expect(screen.queryByTestId('about-modal-content')).not.toBeInTheDocument();
  });

  it('renders AboutModalContent when pathname is /settings/about', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/about' });
    render(<SystemSettings />);
    expect(screen.getByTestId('about-modal-content')).toBeInTheDocument();
    expect(screen.queryByTestId('system-modal-content')).not.toBeInTheDocument();
  });

  it('applies max-w-640px contentClassName for about page', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/about' });
    render(<SystemSettings />);
    const wrapper = screen.getByTestId('settings-page-wrapper');
    expect(wrapper).toHaveAttribute('data-content-class', 'max-w-640px');
  });

  it('does not apply contentClassName for system page', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/system' });
    render(<SystemSettings />);
    const wrapper = screen.getByTestId('settings-page-wrapper');
    expect(wrapper).not.toHaveAttribute('data-content-class');
  });

  it('mounts the ace Open With section on the system page only', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/system' });
    const { unmount } = render(<SystemSettings />);
    expect(screen.getByTestId('open-with-settings')).toBeInTheDocument();
    unmount();

    mockUseLocation.mockReturnValue({ pathname: '/settings/about' });
    render(<SystemSettings />);
    expect(screen.queryByTestId('open-with-settings')).not.toBeInTheDocument();
  });

  it('wraps content in SettingsPageWrapper', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings/system' });
    render(<SystemSettings />);
    expect(screen.getByTestId('settings-page-wrapper')).toBeInTheDocument();
  });
});
