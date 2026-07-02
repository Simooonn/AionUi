/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Message, Tabs } from '@arco-design/web-react';
import { Terminal as TerminalIcon } from '@icon-park/react';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalStore, useTerminalStore } from './useTerminalStore';
import XtermView from './XtermView';

// Soft cap on concurrent terminals per conversation (plan §1).
const TERMINAL_SOFT_CAP = 10;
// Initial geometry handed to the PTY; XtermView re-fits to the real panel size on mount.
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface TerminalTabsProps {
  conversationId: string;
  /** Conversation workspace dir — the new terminal's CWD. */
  workspace: string;
  /** True when the Workspace "terminal" tab is the active tab. */
  visible: boolean;
}

/**
 * Inner tab strip managing multiple terminals for one conversation. Rehydrates
 * the live PTY list from the main process on mount, creates/closes/restarts
 * terminals, and renders one {@link XtermView} per tab.
 */
const TerminalTabs: React.FC<TerminalTabsProps> = ({ conversationId, workspace, visible }) => {
  const { t } = useTranslation();
  const { ids, activeId } = useTerminalStore(conversationId);

  const createTerminal = useCallback(async () => {
    if (terminalStore.getState(conversationId).ids.length >= TERMINAL_SOFT_CAP) {
      Message.warning(t('conversation.workspace.terminal.capReached', { max: TERMINAL_SOFT_CAP }));
      return;
    }
    try {
      const { terminalId } = await ipcBridge.terminal.create.invoke({
        conversationId,
        cwd: workspace,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      });
      terminalStore.add(conversationId, terminalId);
    } catch (error) {
      console.error('[Terminal] create failed:', error);
      Message.error(t('conversation.workspace.terminal.createFailed'));
    }
  }, [conversationId, workspace, t]);

  const closeTerminal = useCallback(
    (terminalId: string) => {
      terminalStore.remove(conversationId, terminalId);
      void ipcBridge.terminal.dispose.invoke({ terminalId }).catch((error) => {
        console.error('[Terminal] dispose failed:', error);
      });
    },
    [conversationId]
  );

  const restartTerminal = useCallback(
    (terminalId: string) => {
      closeTerminal(terminalId);
      void createTerminal();
    },
    [closeTerminal, createTerminal]
  );

  // Rehydrate the live terminal list from the main process whenever the
  // conversation changes; auto-open one terminal when the panel is shown empty.
  const didInitRef = useRef(false);
  useEffect(() => {
    didInitRef.current = false;
    let cancelled = false;
    void ipcBridge.terminal.list
      .invoke({ conversationId })
      .then((list) => {
        if (cancelled) return;
        terminalStore.sync(
          conversationId,
          list.map((entry) => entry.terminalId)
        );
      })
      .catch((error) => {
        console.error('[Terminal] list failed:', error);
      })
      .finally(() => {
        if (!cancelled) didInitRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Auto-create the first terminal once the panel is shown and none exist.
  useEffect(() => {
    if (visible && didInitRef.current && ids.length === 0) {
      void createTerminal();
    }
  }, [visible, ids.length, createTerminal]);

  const onTabChange = useCallback(
    (key: string) => {
      terminalStore.setActive(conversationId, key);
    },
    [conversationId]
  );

  return (
    <div className='size-full flex flex-col'>
      <Tabs
        editable
        // `justify` activates Arco's .arco-tabs-justify height:100% rules for the
        // internal .arco-tabs-content-inner / .arco-tabs-content-item wrappers.
        // Without it those two stay height:auto and the whole pane chain collapses
        // to xterm's natural size, leaving a blank band under the terminal.
        justify
        type='card-gutter'
        size='small'
        activeTab={activeId ?? undefined}
        onChange={onTabChange}
        onAddTab={() => void createTerminal()}
        onDeleteTab={closeTerminal}
        showAddButton={ids.length < TERMINAL_SOFT_CAP}
        className='terminal-tabs size-full flex flex-col [&_.arco-tabs-content]:flex-1 [&_.arco-tabs-content]:min-h-0 [&_.arco-tabs-pane]:size-full'
      >
        {ids.map((id, index) => (
          <Tabs.TabPane
            key={id}
            title={
              <span className='flex items-center gap-4px'>
                <TerminalIcon size={14} />
                {t('conversation.workspace.terminal.tabLabel', { index: index + 1 })}
              </span>
            }
          >
            <XtermView terminalId={id} active={visible && id === activeId} onRestart={restartTerminal} />
          </Tabs.TabPane>
        ))}
      </Tabs>
    </div>
  );
};

export default TerminalTabs;
