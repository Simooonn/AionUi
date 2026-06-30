/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import AcpRuntimeModelControls from '@/renderer/components/agent/AcpRuntimeModelControls';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';

// Claude-style combined `<model>/<effort>` list (subset).
const combinedModelInfo: AcpModelInfo = {
  current_model_id: 'opus[1m]/high',
  current_model_label: 'Opus (1M context) (high)',
  available_models: [
    { id: 'opus/low', label: 'claude-opus-4-8 (low)' },
    { id: 'opus/high', label: 'claude-opus-4-8 (high)' },
    { id: 'sonnet/low', label: 'claude-sonnet-4-6 (low)' },
    { id: 'sonnet/high', label: 'claude-sonnet-4-6 (high)' },
    { id: 'opus[1m]/low', label: 'Opus (1M context) (low)' },
    { id: 'opus[1m]/high', label: 'Opus (1M context) (high)' },
    { id: 'opus[1m]/max', label: 'Opus (1M context) (max)' },
  ],
};

// Plain (non-combined) model list — separate thought-level option.
const plainModelInfo: AcpModelInfo = {
  current_model_id: 'gpt-5.2',
  current_model_label: 'GPT-5.2',
  available_models: [
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.2-mini', label: 'GPT-5.2 Mini' },
  ],
};

const thoughtLevel: AcpDerivedOption = {
  id: 'thought_level',
  category: 'thought_level',
  currentValue: 'high',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
};

type Props = React.ComponentProps<typeof AcpRuntimeModelControls>;

const makeProps = (overrides: Partial<Props> = {}): Props => ({
  model_info: combinedModelInfo,
  currentModelId: combinedModelInfo.current_model_id,
  canSwitch: true,
  isSetting: false,
  setStatus: { state: 'idle' } as AcpConfigSetStatus,
  onSwitchModel: vi.fn(),
  thoughtLevel: null,
  onSelectThoughtLevel: vi.fn(),
  ...overrides,
});

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getModelDisplayLabel: ({
    selectedLabel,
    selected_value,
    fallbackLabel,
  }: {
    selectedLabel?: string;
    selected_value?: string | null;
    fallbackLabel: string;
  }) => selectedLabel || selected_value || fallbackLabel,
}));

vi.mock('@icon-park/react', () => ({
  Brain: () => <span aria-hidden='true'>brain</span>,
  Down: () => <span aria-hidden='true'>v</span>,
  Loading: ({ className }: { className?: string }) => <span aria-hidden='true' className={className} />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      if (key === 'agent.thoughtLevel.label') return 'Thinking Level';
      if (key === 'common.model') return 'Model';
      if (key === 'common.defaultModel') return 'Default';
      if (key === 'conversation.welcome.useCliModel') return 'Use CLI model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch is not supported';
      return options?.defaultValue ?? key;
    },
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Menu = Object.assign(
    ({ children }: { children?: React.ReactNode }) => <div data-testid='dropdown-menu'>{children}</div>,
    {
      Item: ({
        children,
        className,
        onClick,
      }: {
        children?: React.ReactNode;
        className?: string;
        onClick?: () => void;
      }) => (
        <div role='menuitem' className={className} onClick={onClick}>
          {children}
        </div>
      ),
      ItemGroup: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) => (
        <div role='group' aria-label={String(title)}>
          {children}
        </div>
      ),
    }
  );
  return {
    Button: ({
      children,
      disabled,
      onClick,
      ...props
    }: {
      children?: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button type='button' disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
      <div>
        {children}
        {droplist}
      </div>
    ),
    Menu,
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

describe('AcpRuntimeModelControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('combined <model>/<effort> backends (Claude Code)', () => {
    it('renders a model pill and an effort pill, both with testids', () => {
      render(<AcpRuntimeModelControls {...makeProps()} />);
      expect(screen.getByTestId('acp-toolbar-model-selector')).toBeInTheDocument();
      expect(screen.getByTestId('acp-toolbar-thought-level-selector')).toBeInTheDocument();
    });

    it('model dropdown lists unique models, effort dropdown lists unique efforts', () => {
      render(<AcpRuntimeModelControls {...makeProps()} />);
      const modelGroup = screen.getByRole('group', { name: 'Model' });
      const modelItems = within(modelGroup)
        .getAllByRole('menuitem')
        .map((n) => n.textContent?.replace('✓', '').trim());
      expect(modelItems).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6', 'Opus (1M context)']);

      const effortGroup = screen.getByRole('group', { name: 'Thinking Level' });
      const effortItems = within(effortGroup)
        .getAllByRole('menuitem')
        .map((n) => n.textContent?.replace('✓', '').trim());
      expect(effortItems).toEqual(['low', 'high', 'max']);
    });

    it('selecting a different model keeps the current effort (recombines id)', () => {
      const onSwitchModel = vi.fn();
      render(<AcpRuntimeModelControls {...makeProps({ onSwitchModel })} />);
      const modelGroup = screen.getByRole('group', { name: 'Model' });
      fireEvent.click(within(modelGroup).getByText('claude-sonnet-4-6'));
      // current effort is 'high' (from opus[1m]/high)
      expect(onSwitchModel).toHaveBeenCalledWith('sonnet/high');
    });

    it('selecting a different effort keeps the current model (recombines id)', () => {
      const onSwitchModel = vi.fn();
      render(<AcpRuntimeModelControls {...makeProps({ onSwitchModel })} />);
      const effortGroup = screen.getByRole('group', { name: 'Thinking Level' });
      fireEvent.click(within(effortGroup).getByText('max'));
      expect(onSwitchModel).toHaveBeenCalledWith('opus[1m]/max');
    });

    it('reflects the live model_info over a stale currentModelId prop', () => {
      // Stale persisted prop points at sonnet; live runtime says opus[1m]/high.
      render(<AcpRuntimeModelControls {...makeProps({ currentModelId: 'sonnet/low' })} />);
      expect(screen.getByTestId('acp-toolbar-model-selector')).toHaveTextContent('Opus (1M context)');
      expect(screen.getByTestId('acp-toolbar-thought-level-selector')).toHaveTextContent('high');
    });

    it('renders read-only pills with no dropdown when canSwitch is false', () => {
      render(<AcpRuntimeModelControls {...makeProps({ canSwitch: false })} />);
      // Pills still show the current model + effort...
      expect(screen.getByTestId('acp-toolbar-model-selector')).toHaveTextContent('Opus (1M context)');
      expect(screen.getByTestId('acp-toolbar-thought-level-selector')).toHaveTextContent('high');
      // ...but the switch dropdowns are absent (read-only).
      expect(screen.queryByRole('group', { name: 'Model' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Thinking Level' })).not.toBeInTheDocument();
    });
  });

  describe('plain (non-combined) backends', () => {
    it('renders a model pill plus a separate thought-level pill when thoughtLevel is present', () => {
      render(<AcpRuntimeModelControls {...makeProps({ model_info: plainModelInfo, thoughtLevel })} />);
      expect(screen.getByTestId('acp-toolbar-model-selector')).toHaveTextContent('GPT-5.2');
      expect(screen.getByTestId('acp-toolbar-thought-level-selector')).toHaveTextContent('High');
    });

    it('hides the thought-level pill when there is no separate thought option', () => {
      render(<AcpRuntimeModelControls {...makeProps({ model_info: plainModelInfo, thoughtLevel: null })} />);
      expect(screen.getByTestId('acp-toolbar-model-selector')).toBeInTheDocument();
      expect(screen.queryByTestId('acp-toolbar-thought-level-selector')).not.toBeInTheDocument();
    });

    it('selecting a model calls onSwitchModel with the raw id', () => {
      const onSwitchModel = vi.fn();
      render(<AcpRuntimeModelControls {...makeProps({ model_info: plainModelInfo, onSwitchModel })} />);
      const modelGroup = screen.getByRole('group', { name: 'Model' });
      fireEvent.click(within(modelGroup).getByText('GPT-5.2 Mini'));
      expect(onSwitchModel).toHaveBeenCalledWith('gpt-5.2-mini');
    });

    it('renders a read-only model pill with no dropdown when canSwitch is false', () => {
      render(<AcpRuntimeModelControls {...makeProps({ model_info: plainModelInfo, canSwitch: false })} />);
      expect(screen.getByTestId('acp-toolbar-model-selector')).toHaveTextContent('GPT-5.2');
      expect(screen.queryByRole('group', { name: 'Model' })).not.toBeInTheDocument();
    });
  });

  it('shows a read-only "Use CLI model" pill when there is no model info', () => {
    render(<AcpRuntimeModelControls {...makeProps({ model_info: null, currentModelId: undefined })} />);
    expect(screen.getByText('Use CLI model')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-toolbar-model-selector')).not.toBeInTheDocument();
  });

  it('disables the pills while a config option is being set', () => {
    render(
      <AcpRuntimeModelControls
        {...makeProps({ setStatus: { state: 'setting', optionId: 'model', requestedValue: 'x' } })}
      />
    );
    expect(screen.getByTestId('acp-toolbar-model-selector')).toBeDisabled();
    expect(screen.getByTestId('acp-toolbar-thought-level-selector')).toBeDisabled();
  });
});
