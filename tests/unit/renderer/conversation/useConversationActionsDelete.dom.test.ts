/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ConfirmConfig = {
  title: string;
  content: string;
  okButtonProps?: { status?: string };
  onOk: () => Promise<void>;
};

const { navigateMock, routeState, removeMock, archiveMock, disposeMock, emitMock, messageMock, confirmMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    routeState: { id: undefined as string | undefined },
    removeMock: vi.fn(),
    archiveMock: vi.fn(),
    disposeMock: vi.fn(),
    emitMock: vi.fn(),
    messageMock: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    confirmMock: vi.fn(),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: routeState.id }),
  };
});

vi.mock('@arco-design/web-react', () => ({
  Message: messageMock,
  Modal: { confirm: confirmMock },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remove: { invoke: removeMock },
      update: { invoke: vi.fn() },
    },
    sidebar: { archive: { invoke: archiveMock } },
    terminal: { disposeByConversation: { invoke: disposeMock } },
  },
}));

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  requestConversationSendBoxPrefill: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: emitMock },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const makeConversation = (id: string): TChatConversation =>
  ({
    id,
    type: 'acp',
    name: id,
    created_at: 1,
    modified_at: 1,
    extra: { backend: 'claude' },
    model: {},
  }) as TChatConversation;

// Local CLI data channel exposed by the preload (resolve before delete, unlink after).
const resolveFilesMock = vi.fn();
const unlinkMock = vi.fn();

type RenderOptions = {
  selected?: string[];
  running?: string[];
};

const renderActions = ({ selected = [], running = [] }: RenderOptions = {}) => {
  const setSelectedConversationIds = vi.fn();
  const onBatchModeChange = vi.fn();
  const hook = renderHook(() =>
    useConversationActions({
      batchMode: selected.length > 0,
      onBatchModeChange,
      selectedConversationIds: new Set(selected),
      setSelectedConversationIds,
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
      markManualUnread: vi.fn(),
      clearManualUnread: vi.fn(),
      isManualUnread: () => false,
      isConversationRunning: (conversation_id) => running.includes(conversation_id),
    })
  );
  return { ...hook, setSelectedConversationIds, onBatchModeChange };
};

const lastConfirm = (): ConfirmConfig => confirmMock.mock.calls.at(-1)?.[0] as ConfirmConfig;

const testWindow = window as unknown as { electronAPI?: unknown };

describe('sidebar direct delete actions', () => {
  let originalElectronApi: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    routeState.id = undefined;
    removeMock.mockResolvedValue({ success: true });
    disposeMock.mockResolvedValue(undefined);
    resolveFilesMock.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { kind: 'file', path: `/home/.claude/projects/${id}.jsonl` }]))
    );
    unlinkMock.mockImplementation(async (paths: string[]) =>
      Object.fromEntries(paths.map((path) => [path, { deleted: true }]))
    );
    originalElectronApi = testWindow.electronAPI;
    testWindow.electronAPI = {
      resolveConversationFiles: resolveFilesMock,
      unlinkSessionFiles: unlinkMock,
    };
  });

  afterEach(() => {
    testWindow.electronAPI = originalElectronApi;
  });

  it('asks for confirmation and deletes nothing until confirmed', () => {
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));

    const config = lastConfirm();
    expect(config.title).toBe('conversation.history.deleteTitle');
    expect(config.content).toContain('conversation.history.deleteConfirm');
    expect(config.content).toContain('conversation.history.deleteIrreversibleHint');
    expect(config.content).not.toContain('deleteRunning');
    expect(config.okButtonProps?.status).toBe('danger');
    // Cancelling the modal simply never calls onOk.
    expect(removeMock).not.toHaveBeenCalled();
    expect(resolveFilesMock).not.toHaveBeenCalled();
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it('deletes the row DB-first, then cleans its local session data and terminals', async () => {
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));
    await act(() => lastConfirm().onOk());

    expect(removeMock).toHaveBeenCalledWith({ id: 'a' });
    expect(resolveFilesMock.mock.invocationCallOrder[0]).toBeLessThan(removeMock.mock.invocationCallOrder[0]);
    expect(unlinkMock).toHaveBeenCalledWith(['/home/.claude/projects/a.jsonl']);
    expect(disposeMock).toHaveBeenCalledWith({ conversationId: 'a' });
    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'a');
    expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
    expect(messageMock.success).toHaveBeenCalledWith('conversation.history.deleteSuccess');
    expect(archiveMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('leaves the deleted conversation when it is the one currently open', async () => {
    routeState.id = 'a';
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));
    await act(() => lastConfirm().onOk());

    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('warns that deleting a running conversation interrupts its task', () => {
    const { result } = renderActions({ running: ['a'] });

    act(() => result.current.handleDelete(makeConversation('a')));

    expect(lastConfirm().content).toContain('conversation.history.deleteRunningHint');
  });

  it('batch-deletes only the selection, then clears it and leaves batch mode', async () => {
    const { result, setSelectedConversationIds, onBatchModeChange } = renderActions({
      selected: ['a', 'b'],
      running: ['b'],
    });

    act(() => result.current.handleBatchDelete());
    const config = lastConfirm();
    expect(config.title).toBe('conversation.history.batchDelete');
    expect(config.content).toContain('conversation.history.batchDeleteConfirm {"count":2}');
    expect(config.content).toContain('conversation.history.deleteRunningCountHint {"count":1}');

    await act(() => config.onOk());

    expect(removeMock.mock.calls.map(([params]) => params.id)).toEqual(['a', 'b']);
    expect(messageMock.success).toHaveBeenCalledWith('conversation.history.batchDeleteSuccess {"count":2}');
    expect(setSelectedConversationIds).toHaveBeenCalledWith(new Set());
    expect(onBatchModeChange).toHaveBeenCalledWith(false);
  });

  it('does not open a batch confirmation with an empty selection', () => {
    const { result } = renderActions();

    act(() => result.current.handleBatchDelete());

    expect(confirmMock).not.toHaveBeenCalled();
    expect(messageMock.warning).toHaveBeenCalledWith('conversation.history.batchNoSelection');
  });

  it('deletes exactly the project folder rows, never archiving or touching other rows', async () => {
    const { result } = renderActions();

    act(() => result.current.handleDeleteProject('my-project', [makeConversation('a'), makeConversation('b')]));
    const config = lastConfirm();
    expect(config.title).toBe('conversation.history.deleteProject');
    expect(config.content).toContain('conversation.history.deleteProjectConfirm {"name":"my-project","count":2}');

    await act(() => config.onOk());

    expect(removeMock.mock.calls.map(([params]) => params.id)).toEqual(['a', 'b']);
    expect(archiveMock).not.toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalledWith(['/home/.claude/projects/a.jsonl', '/home/.claude/projects/b.jsonl']);
  });

  it('ignores a project folder with no conversations', () => {
    const { result } = renderActions();

    act(() => result.current.handleDeleteProject('empty', []));

    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('reports a partial failure honestly and keeps the failed row local data', async () => {
    removeMock.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'b') throw new Error('backend 500');
      return { success: true };
    });
    const { result } = renderActions({ selected: ['a', 'b'] });

    act(() => result.current.handleBatchDelete());
    await act(() => lastConfirm().onOk());

    expect(unlinkMock).toHaveBeenCalledWith(['/home/.claude/projects/a.jsonl']);
    expect(messageMock.warning).toHaveBeenCalledWith(
      'conversation.history.deletePartialFailed {"success":1,"failed":1}'
    );
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('reports failure and cleans nothing when every delete fails', async () => {
    removeMock.mockRejectedValue(new Error('backend 500'));
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));
    await act(() => lastConfirm().onOk());

    expect(messageMock.error).toHaveBeenCalledWith('conversation.history.deleteFailed');
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('warns once when local session files could not be removed', async () => {
    unlinkMock.mockImplementation(async (paths: string[]) =>
      Object.fromEntries(paths.map((path) => [path, { deleted: false, reason: 'delete-failed' }]))
    );
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));
    await act(() => lastConfirm().onOk());

    expect(messageMock.success).toHaveBeenCalledWith('conversation.history.deleteSuccess');
    expect(messageMock.warning).toHaveBeenCalledWith('conversation.history.localFileDeleteFailed');
  });

  it('warns about local files when the cleanup call itself fails', async () => {
    unlinkMock.mockRejectedValue(new Error('ipc down'));
    const { result } = renderActions();

    act(() => result.current.handleDelete(makeConversation('a')));
    await act(() => lastConfirm().onOk());

    expect(messageMock.success).toHaveBeenCalledWith('conversation.history.deleteSuccess');
    expect(messageMock.warning).toHaveBeenCalledWith('conversation.history.localFileDeleteFailed');
  });
});
