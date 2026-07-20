/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isRestoreEnabled } from '@/common/ace/resumeCommand';
import { Button, Dropdown, Menu, Message, Tabs, Tooltip } from '@arco-design/web-react';
import { Plus, Terminal as TerminalIcon } from '@icon-park/react';
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
  /**
   * CLI resume command for the current left-sidebar conversation
   * (`buildCliResumeCommand` / `useNativeResumeCommand`), or null when
   * unavailable / still resolving.
   */
  resumeCommand?: string | null;
}

/**
 * Inner tab strip managing multiple terminals for one conversation. Rehydrates
 * the live PTY list from the main process on mount, creates/closes/restarts
 * terminals, and renders one {@link XtermView} per tab.
 *
 * The add control is a dropdown: New tab (plain PTY) or Restore session
 * (create PTY + inject the app-built CLI resume command).
 */
const TerminalTabs: React.FC<TerminalTabsProps> = ({
  conversationId,
  workspace,
  visible,
  resumeCommand = null,
}) => {
  const { t } = useTranslation();
  const { ids, activeId } = useTerminalStore(conversationId);
  const canRestore = isRestoreEnabled(resumeCommand);

  const createTerminalInternal = useCallback(async (): Promise<string | null> => {
    if (!workspace) {
      // Workspace not ready yet — creating now would spawn the PTY in the main
      // process cwd. The auto-create effect refires once `workspace` arrives.
      console.warn('[Terminal] create skipped: workspace not ready');
      return null;
    }
    if (terminalStore.getState(conversationId).ids.length >= TERMINAL_SOFT_CAP) {
      Message.warning(t('conversation.workspace.terminal.capReached', { max: TERMINAL_SOFT_CAP }));
      return null;
    }
    try {
      const { terminalId } = await ipcBridge.terminal.create.invoke({
        conversationId,
        cwd: workspace,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      });
      terminalStore.add(conversationId, terminalId);
      return terminalId;
    } catch (error) {
      console.error('[Terminal] create failed:', error);
      Message.error(t('conversation.workspace.terminal.createFailed'));
      return null;
    }
  }, [conversationId, workspace, t]);

  const createTerminal = useCallback(async () => {
    await createTerminalInternal();
  }, [createTerminalInternal]);

  const restoreSession = useCallback(
    async (cmd: string) => {
      const terminalId = await createTerminalInternal();
      if (!terminalId) return;
      const api = window.terminalAPI;
      if (!api?.input) {
        Message.error(t('conversation.workspace.terminal.createFailed'));
        return;
      }
      api.input(terminalId, `${cmd}\n`);
    },
    [createTerminalInternal, t]
  );

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

  // Auto-create the first terminal once the panel is shown, none exist, and
  // the workspace is known (createTerminal depends on `workspace`, so this
  // effect refires when it becomes available).
  useEffect(() => {
    if (visible && didInitRef.current && ids.length === 0 && workspace) {
      void createTerminal();
    }
  }, [visible, ids.length, workspace, createTerminal]);

  const onTabChange = useCallback(
    (key: string) => {
      terminalStore.setActive(conversationId, key);
    },
    [conversationId]
  );

  const addMenu = (
    <Menu>
      <Menu.Item key='new' onClick={() => void createTerminal()}>
        {t('conversation.workspace.terminal.newTab')}
      </Menu.Item>
      <Tooltip content={t('conversation.workspace.terminal.restoreUnavailable')} disabled={canRestore}>
        <span className='block'>
          <Menu.Item
            key='restore'
            disabled={!canRestore}
            onClick={() => {
              if (!canRestore) return;
              void restoreSession(resumeCommand);
            }}
          >
            {t('conversation.workspace.terminal.restoreSession')}
          </Menu.Item>
        </span>
      </Tooltip>
    </Menu>
  );

  // Always pin the add control on the far left of the tab strip.
  // Use semantic --primary so light (#165dff) and dark (#4d9fff) both stay readable;
  // force light icon color for contrast on the solid primary fill.
  const addButton = (
    <Dropdown droplist={addMenu} trigger='click' position='bl'>
      <Button
        type='primary'
        size='mini'
        shape='circle'
        icon={<Plus size={12} fill='currentColor' />}
        aria-label={t('conversation.workspace.terminal.newTab')}
        className='terminal-tabs__add !w-20px !h-20px !p-0 !bg-primary !border-primary !text-white hover:!opacity-90'
      />
    </Dropdown>
  );

  return (
    <div className='size-full flex flex-col'>
      <div className='relative size-full flex flex-col min-h-0'>
        {/* Left-aligned add control — independent of tab titles so it stays findable. */}
        <div className='absolute top-0 left-6px z-20 flex items-center h-32px pointer-events-auto'>{addButton}</div>
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
          onDeleteTab={closeTerminal}
          showAddButton={false}
          // Leave room on the left so the first tab title doesn't sit under the + button.
          className='terminal-tabs size-full flex flex-col [&_.arco-tabs-header-nav]:pl-28px [&_.arco-tabs-content]:flex-1 [&_.arco-tabs-content]:min-h-0 [&_.arco-tabs-pane]:size-full'
        >
          {ids.map((id, index) => (
            <Tabs.TabPane
              key={id}
              title={
                <span className='inline-flex items-center gap-4px'>
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
    </div>
  );
};

export default TerminalTabs;
