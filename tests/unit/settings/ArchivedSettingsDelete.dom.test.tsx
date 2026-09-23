/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ace: permanent delete on the archived page must clean up local CLI session
 * data and release per-conversation renderer/main state, exactly like the
 * sidebar delete did before upstream moved hard-delete to this page.
 */

import React from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { getMock, deleteItemMock, deleteProjectMock, disposeMock, emitMock, warningMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  deleteItemMock: vi.fn(() => Promise.resolve()),
  deleteProjectMock: vi.fn(() => Promise.resolve({ deleted: 0 })),
  disposeMock: vi.fn(() => Promise.resolve()),
  emitMock: vi.fn(),
  warningMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    sidebar: {
      get: { invoke: getMock },
      items: { invoke: vi.fn() },
      unarchive: { invoke: vi.fn(() => Promise.resolve()) },
      deleteArchivedItem: { invoke: deleteItemMock },
      deleteArchivedProject: { invoke: deleteProjectMock },
    },
    terminal: { disposeByConversation: { invoke: disposeMock } },
  },
}));

// Confirm dialogs run their OK handler straight away so the test drives the
// delete path without poking at Arco's portal markup.
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Modal: { ...actual.Modal, confirm: (config: { onOk?: () => Promise<void> | void }) => void config.onOk?.() },
    Message: { ...actual.Message, success: vi.fn(), error: vi.fn(), warning: warningMock },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({ useAgentLogos: () => ({}) }));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: emitMock } }));
vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'assistant_fallback' as const }),
}));
vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{actions}</div>
    </div>
  ),
}));

import ArchivedSettings from '@/renderer/pages/settings/ArchivedSettings';

const conv = (id: string, name: string) => ({
  type: 'conversation' as const,
  conversation: { id, name, created_at: 1_700_000_000_000 },
});

const team = (id: string, name: string, members: string[]) => ({
  type: 'team' as const,
  team_id: id,
  name,
  updated_at: 1_700_000_000_000,
  pinned: false,
  member_conversation_ids: members,
});

const chatsGroup = (items: unknown[]) => ({
  scope: { type: 'chats' as const },
  items,
  has_more: false,
});

type Refs = Record<string, { kind: 'file'; path: string }>;

const installApi = (refs: Refs, unlinkOk = true) => {
  const resolveSpy = vi.fn(async () => refs);
  const unlinkSpy = vi.fn(async (paths: string[]) =>
    Object.fromEntries(
      paths.map((p) => [p, unlinkOk ? { deleted: true } : { deleted: false, reason: 'delete-failed' }])
    )
  );
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    resolveConversationFiles: resolveSpy,
    unlinkSessionFiles: unlinkSpy,
  };
  return { resolveSpy, unlinkSpy };
};

const renderPage = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ArchivedSettings />
    </SWRConfig>
  );

/** The trash button is the first button inside the row that shows `name`. */
const clickRowDelete = async (name: string) => {
  const row = (await screen.findByText(name)).closest('.group') as HTMLElement;
  const button = row.querySelector('button') as HTMLButtonElement;
  fireEvent.click(button);
};

describe('ArchivedSettings permanent delete (ace local cleanup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('unlinks the local session file and releases the conversation after deleting one row', async () => {
    getMock.mockResolvedValue({ groups: [chatsGroup([conv('c1', 'Chat One')])], has_more_groups: false });
    const { unlinkSpy } = installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } });

    renderPage();
    await clickRowDelete('Chat One');

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith({ item_type: 'conversation', item_id: 'c1' }));
    await waitFor(() => expect(unlinkSpy).toHaveBeenCalledWith(['/x/c1.jsonl']));
    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'c1');
    expect(disposeMock).toHaveBeenCalledWith({ conversationId: 'c1' });
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('cleans up every member conversation when a team row is deleted', async () => {
    getMock.mockResolvedValue({ groups: [chatsGroup([team('t1', 'Team One', ['m1', 'm2'])])], has_more_groups: false });
    const { resolveSpy } = installApi({});

    renderPage();
    await clickRowDelete('Team One');

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith({ item_type: 'team', item_id: 't1' }));
    expect(resolveSpy).toHaveBeenCalledWith(['m1', 'm2']);
    await waitFor(() => expect(disposeMock).toHaveBeenCalledWith({ conversationId: 'm2' }));
    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'm1');
  });

  it('warns once when the backend delete succeeded but a local file could not be removed', async () => {
    getMock.mockResolvedValue({ groups: [chatsGroup([conv('c1', 'Chat One')])], has_more_groups: false });
    installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } }, false);

    renderPage();
    await clickRowDelete('Chat One');

    await waitFor(() => expect(warningMock).toHaveBeenCalledWith('conversation.history.localFileDeleteFailed'));
    expect(deleteItemMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch local files or release state when the backend delete fails', async () => {
    getMock.mockResolvedValue({ groups: [chatsGroup([conv('c1', 'Chat One')])], has_more_groups: false });
    deleteItemMock.mockRejectedValueOnce(new Error('boom'));
    const { unlinkSpy } = installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } });

    renderPage();
    await clickRowDelete('Chat One');

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalled());
    // Give the rejected chain a tick to settle before asserting nothing else ran.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });
});
