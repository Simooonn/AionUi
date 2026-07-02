/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Terminal-style chat overlay. Renders inside AcpChat's
// MessageListProvider/ConversationArtifactProvider tree so it shares the same
// message state as the normal chat view — no second subscription needed.
// Covers only the conversation column (the app header, left sidebar and right
// workspace panel stay visible). Unmounts when closed (open=false); the unsent
// draft survives via TerminalChatViewContext.
import { Button, Input } from '@arco-design/web-react';
import { Close, Terminal } from '@icon-park/react';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalChatView } from './TerminalChatViewContext';
import TerminalHudStatusBar from './TerminalHudStatusBar';
import styles from './TerminalChatOverlay.module.css';

type Props = {
  handleSendCommand: (input: string, files: string[]) => Promise<void>;
};

const TerminalChatOverlayInner: React.FC<Props> = ({ handleSendCommand }) => {
  const { t } = useTranslation();
  const terminalView = useTerminalChatView();
  const draft = terminalView?.draft ?? '';
  const setDraft = terminalView?.setDraft ?? (() => undefined);
  const toggle = terminalView?.toggle;

  // Esc closes the overlay (same as clicking the header toggle again).
  useEffect(() => {
    if (!toggle) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const handleSubmit = async () => {
    const input = draft.trim();
    if (!input) return;
    setDraft('');
    await handleSendCommand(input, []);
  };

  return (
    <div className={styles.overlay} data-testid='terminal-chat-overlay'>
      <div className={styles.headerRow}>
        <span className={styles.headerTitle}>
          <Terminal theme='outline' size={14} />
          {t('conversation.terminalView.title', { defaultValue: 'Terminal View' })}
        </span>
        <Button
          type='text'
          size='mini'
          icon={<Close theme='outline' size={14} />}
          aria-label={t('conversation.terminalView.close')}
          onClick={toggle}
        />
      </div>
      <MessageList className={styles.messageList} />
      <div className={styles.inputRow}>
        <span className={styles.prompt}>{'>'}</span>
        <Input
          className={styles.input}
          value={draft}
          onChange={setDraft}
          onPressEnter={handleSubmit}
          placeholder={t('conversation.terminalView.placeholder', {
            defaultValue: 'Type a message...',
          })}
          allowClear={false}
          autoFocus
        />
      </div>
      <TerminalHudStatusBar />
    </div>
  );
};

const TerminalChatOverlay: React.FC<Props> = (props) => {
  const terminalView = useTerminalChatView();
  if (!terminalView?.open) return null;
  return <TerminalChatOverlayInner {...props} />;
};

export default TerminalChatOverlay;
