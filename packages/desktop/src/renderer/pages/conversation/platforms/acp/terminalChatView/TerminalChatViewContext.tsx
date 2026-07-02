/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * State shared between the header toggle button and the full-screen
 * terminal-style chat overlay. Lifting it here lets the button (rendered in
 * the ChatLayout header slot) and the overlay (rendered inside AcpChat's
 * provider tree) read/drive the same open flag and input draft, without the
 * overlay having to build a parallel message pipeline.
 */
type TerminalChatViewContextValue = {
  /** Whether the full-screen terminal-style view is currently shown. */
  open: boolean;
  /** Toggle the full-screen view open/closed. */
  toggle: () => void;
  /** Unsent input draft, preserved across open/close so unmounting is safe. */
  draft: string;
  /** Update the unsent input draft. */
  setDraft: (value: string) => void;
};

const TerminalChatViewContext = createContext<TerminalChatViewContextValue | null>(null);

export const TerminalChatViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const value = useMemo<TerminalChatViewContextValue>(() => ({ open, toggle, draft, setDraft }), [open, toggle, draft]);

  return <TerminalChatViewContext.Provider value={value}>{children}</TerminalChatViewContext.Provider>;
};

/**
 * Read the terminal-chat-view state. Returns null when called outside a
 * TerminalChatViewProvider (e.g. non-ACP conversations that never mount it),
 * so callers can no-op safely rather than crash.
 */
export const useTerminalChatView = (): TerminalChatViewContextValue | null => {
  return useContext(TerminalChatViewContext);
};
