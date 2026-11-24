import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiderItem from '@/renderer/components/layout/Sider/SiderItem';

const fixtures = vi.hoisted(() => ({
  tooltipContents: [] as string[],
}));

vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false, siderCollapsed: false, setSiderCollapsed: vi.fn() }),
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    Dropdown: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('div', null, children),
    Menu: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('div', null, children),
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: string }) => {
      if (content !== undefined) {
        fixtures.tooltipContents.push(content);
      }
      return ReactModule.createElement('div', null, children);
    },
  };
});

vi.mock('@icon-park/react', () => ({
  MoreOne: () => null,
  Pushpin: () => null,
}));

const renderItem = (props: Partial<React.ComponentProps<typeof SiderItem>> = {}) =>
  render(<SiderItem icon={<span data-testid='icon' />} name='Test team' {...props} />);

describe('SiderItem workspace label', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    fixtures.tooltipContents.length = 0;
  });

  it('renders the last path segment after the name when workspaceLabel is provided', () => {
    renderItem({ workspaceLabel: 'ai-ops', workspacePath: '/Users/x/ai-ops' });

    const label = screen.getByTestId('sider-item-workspace-label');
    expect(label).toHaveTextContent('ai-ops');
    expect(fixtures.tooltipContents).toContain('/Users/x/ai-ops');
  });

  it('does not render the label when workspaceLabel is missing', () => {
    renderItem({ name: 'No workspace team' });

    expect(screen.queryByTestId('sider-item-workspace-label')).not.toBeInTheDocument();
  });

  it('does not render the label when workspaceLabel is an empty string', () => {
    renderItem({ workspaceLabel: '' });

    expect(screen.queryByTestId('sider-item-workspace-label')).not.toBeInTheDocument();
  });

  it('applies the same truncation/tertiary classes as the recent-section projectLabel', () => {
    renderItem({ workspaceLabel: 'ai-ops', workspacePath: '/Users/x/ai-ops' });

    const label = screen.getByTestId('sider-item-workspace-label');
    expect(label.className).toContain('max-w-96px');
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('text-12px');
    expect(label.className).toContain('text-t-tertiary');
  });
});
