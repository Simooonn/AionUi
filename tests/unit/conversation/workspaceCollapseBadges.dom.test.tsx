/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';

const renderCollapse = (props: Partial<React.ComponentProps<typeof WorkspaceCollapse>> = {}) =>
  render(
    <WorkspaceCollapse
      expanded={false}
      onToggle={vi.fn()}
      header={<span>Project</span>}
      badges={<span data-testid='folder-status-badges'>badges</span>}
      {...props}
    >
      <div>row</div>
    </WorkspaceCollapse>
  );

describe('WorkspaceCollapse status badges slot', () => {
  it('shows the badges while the folder is collapsed', () => {
    renderCollapse({ expanded: false });
    expect(screen.getByTestId('folder-status-badges')).toBeInTheDocument();
    expect(screen.queryByText('row')).toBeNull();
  });

  it('keeps the badges after the folder is expanded', () => {
    renderCollapse({ expanded: true });
    expect(screen.getByTestId('folder-status-badges')).toBeInTheDocument();
    expect(screen.getByText('row')).toBeInTheDocument();
  });

  it('renders no badge slot when there is no status to show', () => {
    renderCollapse({ badges: null });
    expect(screen.queryByTestId('folder-status-badges')).toBeNull();
  });

  it('drops the whole header, badges included, when the sider is collapsed', () => {
    renderCollapse({ siderCollapsed: true });
    expect(screen.queryByTestId('folder-status-badges')).toBeNull();
    expect(screen.getByText('row')).toBeInTheDocument();
  });

  it('keeps the badges clear of the trailing actions', () => {
    renderCollapse({ trailing: <button type='button'>menu</button> });
    const badges = screen.getByTestId('folder-status-badges');
    const trailing = screen.getByText('menu');
    expect(badges.parentElement).not.toBe(trailing.parentElement);
    // DOCUMENT_POSITION_FOLLOWING: badges render before the trailing actions.
    expect(badges.compareDocumentPosition(trailing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
