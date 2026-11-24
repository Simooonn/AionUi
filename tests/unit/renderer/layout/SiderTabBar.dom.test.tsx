import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiderTabBar from '@/renderer/components/layout/Sider/tabs/SiderTabBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SiderTabBar', () => {
  const onTabChange = vi.fn();

  beforeEach(() => {
    onTabChange.mockReset();
  });

  it('renders three tabs and marks the active one', () => {
    render(<SiderTabBar activeTab='recent' onTabChange={onTabChange} />);

    expect(screen.getByTestId('sider-tab-recent')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('sider-tab-team')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('sider-tab-project')).toHaveAttribute('data-active', 'false');
  });

  it('calls onTabChange with the clicked tab', () => {
    render(<SiderTabBar activeTab='recent' onTabChange={onTabChange} />);

    fireEvent.click(screen.getByTestId('sider-tab-team'));

    expect(onTabChange).toHaveBeenCalledWith('team');
  });

  it('disables all tabs when disabled is true', () => {
    render(<SiderTabBar activeTab='recent' onTabChange={onTabChange} disabled />);

    fireEvent.click(screen.getByTestId('sider-tab-project'));

    expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('sider-tab-project')).toBeDisabled();
  });
});
