/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/styles/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { Terminal } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalChatView } from './TerminalChatViewContext';

/**
 * Header toggle that opens/closes the full-screen terminal-style chat view.
 * Rendered right of the cron-job icon in the ACP conversation header. No-ops
 * when rendered outside a TerminalChatViewProvider.
 */
const TerminalChatToggleButton: React.FC = () => {
  const { t } = useTranslation();
  const terminalChatView = useTerminalChatView();
  if (!terminalChatView) return null;
  const { open, toggle } = terminalChatView;

  return (
    <Tooltip content={open ? t('conversation.terminalView.close') : t('conversation.terminalView.open')}>
      <Button
        type='text'
        size='small'
        className='chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
        data-testid='terminal-chat-toggle'
        onClick={toggle}
      >
        <span className='inline-flex items-center rounded-full px-8px py-2px bg-2'>
          <Terminal theme='outline' size={16} fill={open ? iconColors.primary : iconColors.secondary} />
        </span>
      </Button>
    </Tooltip>
  );
};

export default TerminalChatToggleButton;
