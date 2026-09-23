/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ace: the archived page's permanent delete must keep the sidebar's old local
 * cleanup — resolve local CLI session data before the backend delete, unlink
 * only after it succeeds, and release the PTYs / queue state bound to each
 * removed conversation.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const { disposeMock, emitMock } = vi.hoisted(() => ({
  disposeMock: vi.fn(() => Promise.resolve()),
  emitMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { terminal: { disposeByConversation: { invoke: disposeMock } } },
}));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: emitMock } }));

import { deleteArchivedWithCleanup } from '@/renderer/pages/settings/ArchivedSettings/deleteArchivedWithCleanup';

type Refs = Record<string, { kind: 'file'; path: string }>;

const installApi = (refs: Refs) => {
  const resolveSpy = vi.fn(async () => refs);
  const unlinkSpy = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, { deleted: true }])));
  (globalThis as { window?: unknown }).window = {
    electronAPI: { resolveConversationFiles: resolveSpy, unlinkSessionFiles: unlinkSpy },
  };
  return { resolveSpy, unlinkSpy };
};

describe('deleteArchivedWithCleanup', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.clearAllMocks();
  });

  it('resolves local data before the backend delete and unlinks only after it succeeds', async () => {
    const { resolveSpy, unlinkSpy } = installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } });
    const order: string[] = [];
    resolveSpy.mockImplementation(async () => {
      order.push('resolve');
      return { c1: { kind: 'file', path: '/x/c1.jsonl' } };
    });
    unlinkSpy.mockImplementation(async (paths: string[]) => {
      order.push('unlink');
      return Object.fromEntries(paths.map((p) => [p, { deleted: true }]));
    });
    const backend = vi.fn(async () => {
      order.push('backend');
    });

    const result = await deleteArchivedWithCleanup(['c1'], backend);

    expect(order).toEqual(['resolve', 'backend', 'unlink']);
    expect(unlinkSpy).toHaveBeenCalledWith(['/x/c1.jsonl']);
    expect(result.fileDeleteFailed).toBe(false);
  });

  it('releases every removed conversation: deleted event plus PTY disposal', async () => {
    installApi({});

    await deleteArchivedWithCleanup(['m1', 'm2'], async () => {});

    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'm1');
    expect(emitMock).toHaveBeenCalledWith('conversation.deleted', 'm2');
    expect(disposeMock).toHaveBeenCalledWith({ conversationId: 'm1' });
    expect(disposeMock).toHaveBeenCalledWith({ conversationId: 'm2' });
  });

  it('rethrows a backend failure without unlinking or releasing anything', async () => {
    const { unlinkSpy } = installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } });

    await expect(deleteArchivedWithCleanup(['c1'], () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it('reports fileDeleteFailed when a local unlink fails after the backend delete', async () => {
    const { unlinkSpy } = installApi({ c1: { kind: 'file', path: '/x/c1.jsonl' } });
    unlinkSpy.mockImplementation(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, { deleted: false, reason: 'delete-failed' }]))
    );

    const result = await deleteArchivedWithCleanup(['c1'], async () => {});

    expect(result.fileDeleteFailed).toBe(true);
  });

  it('still runs the backend delete for a unit with no conversations', async () => {
    const { unlinkSpy } = installApi({});
    const backend = vi.fn(async () => {});

    await deleteArchivedWithCleanup([], backend);

    expect(backend).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).not.toHaveBeenCalled();
  });
});
