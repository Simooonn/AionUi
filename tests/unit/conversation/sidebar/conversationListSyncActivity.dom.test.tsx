import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { ConversationActivityTimesResult } from '@/common/ace/types';

type Page = { items: TChatConversation[]; total: number; has_more: boolean };
const mocks = vi.hoisted(() => ({
  list: vi.fn<(params: { limit: number; cursor?: string }) => Promise<Page>>(),
  times: vi.fn<() => Promise<ConversationActivityTimesResult>>(),
  log: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn(),
  imported: vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    database: { getUserConversations: { invoke: mocks.list } },
    application: { writeRendererLog: { invoke: mocks.log } },
  },
}));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: mocks.emit }, addEventListener: vi.fn() }));
vi.mock('@arco-design/web-react', () => ({ Message: { warning: vi.fn() } }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

const conversation = (id: string, modified_at = 9000): TChatConversation =>
  ({ id, name: id, type: 'acp', created_at: 100, modified_at, extra: { backend: 'claude' } }) as TChatConversation;
const page = (ids: string[], has_more = false): Page => ({
  items: ids.map((id) => conversation(id)),
  total: ids.length,
  has_more,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.list.mockReset().mockResolvedValue(page(['a']));
  mocks.times.mockReset().mockResolvedValue({ ok: true, times: { a: 1000 } });
  mocks.imported.mockReset();
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { conversationActivityTimes: mocks.times, importConversationMessages: mocks.imported },
  });
});

const loadStore = () => import('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync');

describe('sidebar list and activity generations', () => {
  it('publishes message time rather than metadata changes', async () => {
    const store = await loadStore();
    await store.refreshConversations();
    mocks.list.mockResolvedValue({ ...page(['a']), items: [conversation('a', 99000)] });
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'ok',
      isConversationListComplete: true,
      conversations: [{ id: 'a', chat_activity_at: 1000, modified_at: 99000 }],
    });
  });

  it('keeps list metadata and time unpublished until the time result arrives', async () => {
    const store = await loadStore();
    const pending = deferred<ConversationActivityTimesResult>();
    mocks.times.mockReturnValue(pending.promise);
    const refreshing = store.refreshConversations();
    await vi.waitFor(() => expect(mocks.times).toHaveBeenCalledOnce());
    expect(store.getConversationListSyncSnapshot()).toMatchObject({ activityStatus: 'pending', conversations: [] });
    pending.resolve({ ok: true, times: { a: 1200 } });
    await refreshing;
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'ok',
      conversations: [{ id: 'a', chat_activity_at: 1200 }],
    });
  });

  it('discards an older time result that finishes after a newer generation', async () => {
    const store = await loadStore();
    const old = deferred<ConversationActivityTimesResult>();
    mocks.times.mockReturnValueOnce(old.promise).mockResolvedValue({ ok: true, times: { b: 2000 } });
    const refreshing = store.refreshConversations();
    await vi.waitFor(() => expect(mocks.times).toHaveBeenCalledOnce());
    mocks.list.mockResolvedValue(page(['b']));
    await store.refreshConversations();
    old.resolve({ ok: true, times: { a: 1000 } });
    await refreshing;
    expect(store.getConversationListSyncSnapshot().conversations.map((item) => item.id)).toEqual(['b']);
  });

  it('discards an older list result without requesting its time map', async () => {
    const store = await loadStore();
    const old = deferred<Page>();
    mocks.list.mockReturnValueOnce(old.promise).mockResolvedValue(page(['b']));
    mocks.times.mockResolvedValue({ ok: true, times: { b: 2000 } });
    const refreshing = store.refreshConversations();
    await store.refreshConversations();
    old.resolve(page(['a']));
    await refreshing;
    expect(mocks.times).toHaveBeenCalledOnce();
    expect(store.getConversationListSyncSnapshot().conversations.map((item) => item.id)).toEqual(['b']);
  });

  it('retries a missing mapping once and publishes ok only after coverage', async () => {
    const store = await loadStore();
    mocks.times.mockResolvedValueOnce({ ok: true, times: {} }).mockResolvedValue({ ok: true, times: { a: 1000 } });
    await store.refreshConversations();
    expect(mocks.times).toHaveBeenCalledTimes(2);
    expect(store.getConversationActivityStatus()).toBe('ok');
  });

  it('preserves a proven time and reports unavailable when coverage stays missing', async () => {
    const store = await loadStore();
    await store.refreshConversations();
    mocks.times.mockResolvedValue({ ok: true, times: {} });
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'unavailable',
      conversations: [{ chat_activity_at: 1000 }],
    });
  });

  it.each([NaN, Infinity, 0, -1])('does not accept invalid mapped time %s', async (time) => {
    const store = await loadStore();
    mocks.times.mockResolvedValue({ ok: true, times: { a: time } });
    await store.refreshConversations();
    expect(store.getConversationActivityStatus()).toBe('unavailable');
    expect(store.getConversationListSyncSnapshot().conversations[0].chat_activity_at).toBeUndefined();
  });

  it.each(['schema-mismatch', 'query-failed'] as const)(
    'reports IPC %s without replacing a proven time',
    async (reason) => {
      const store = await loadStore();
      await store.refreshConversations();
      mocks.times.mockResolvedValue({ ok: false, reason });
      await store.refreshConversations();
      expect(store.getConversationListSyncSnapshot()).toMatchObject({
        activityStatus: 'unavailable',
        conversations: [{ chat_activity_at: 1000 }],
      });
    }
  );

  it('handles a rejected IPC without hiding the list or claiming success', async () => {
    const store = await loadStore();
    mocks.times.mockRejectedValue(new Error('IPC unavailable'));
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'unavailable',
      conversations: [{ id: 'a' }],
    });
  });

  it('keeps the previous list and revokes completeness after a list failure', async () => {
    const store = await loadStore();
    await store.refreshConversations();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.list.mockRejectedValue(new Error('list unavailable'));
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'unavailable',
      isConversationListComplete: false,
      conversations: [{ id: 'a', chat_activity_at: 1000 }],
    });
    logged.mockRestore();
  });

  it('keeps an empty successful list distinct from a failed lookup', async () => {
    const store = await loadStore();
    mocks.list.mockResolvedValue(page([]));
    mocks.times.mockResolvedValue({ ok: true, times: {} });
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'ok',
      isConversationListComplete: true,
      conversations: [],
    });
  });

  it('does not treat a missing desktop method as successful verification', async () => {
    const store = await loadStore();
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
    await store.refreshConversations();
    expect(store.getConversationActivityStatus()).toBe('unavailable');
  });
});

describe('bounded best-effort keyset paging', () => {
  it('loads later pages with id cursor but never authorizes cleanup from multi-page data', async () => {
    const store = await loadStore();
    mocks.list
      .mockResolvedValueOnce({ ...page(['a'], true), total: 2 })
      .mockResolvedValueOnce({ ...page(['b']), total: 2 });
    mocks.times.mockResolvedValue({ ok: true, times: { a: 1000, b: 2000 } });
    await store.refreshConversations();
    expect(mocks.list).toHaveBeenNthCalledWith(2, { limit: 10000, cursor: 'a' });
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'truncated',
      isConversationListComplete: false,
      conversations: [{ id: 'a' }, { id: 'b' }],
    });
  });

  it('does not infer a snapshot from equal counts during member replacement', async () => {
    const store = await loadStore();
    mocks.list
      .mockResolvedValueOnce({ ...page(['old'], true), total: 2 })
      .mockResolvedValueOnce({ ...page(['tail']), total: 2 });
    mocks.times.mockResolvedValue({ ok: true, times: { old: 1000, tail: 2000, inserted: 3000 } });
    await store.refreshConversations();
    expect(store.getConversationActivityStatus()).toBe('truncated');
  });

  it.each(['empty', 'repeated', 'rejected'])(
    'stops an anomalous %s later page without cleanup permission',
    async (kind) => {
      const store = await loadStore();
      mocks.list.mockResolvedValueOnce(page(['a'], true));
      if (kind === 'rejected') mocks.list.mockRejectedValue(new Error('page failed'));
      else mocks.list.mockResolvedValue(page(kind === 'empty' ? [] : ['a'], true));
      await store.refreshConversations();
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(store.getConversationListSyncSnapshot()).toMatchObject({
        activityStatus: 'truncated',
        isConversationListComplete: false,
      });
    }
  );

  it('bounds a changing cursor at twenty pages', async () => {
    const store = await loadStore();
    let index = 0;
    mocks.list.mockImplementation(async () => page([String(++index)], true));
    mocks.times.mockResolvedValue({ ok: true, times: {} });
    await store.refreshConversations();
    expect(mocks.list).toHaveBeenCalledTimes(20);
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'unavailable',
      isConversationListComplete: false,
    });
  });

  it('reports unavailable time independently from incomplete multi-page data', async () => {
    const store = await loadStore();
    mocks.list.mockResolvedValueOnce(page(['a'], true)).mockResolvedValueOnce(page(['b']));
    mocks.times.mockResolvedValue({ ok: false, reason: 'query-failed' });
    await store.refreshConversations();
    expect(store.getConversationListSyncSnapshot()).toMatchObject({
      activityStatus: 'unavailable',
      isConversationListComplete: false,
    });
  });
});

describe('CLI import completion refresh', () => {
  it('refreshes history when a lazy import wrote new rows', async () => {
    const { ensureCliConversationReady } = await import('@/renderer/ace/ensureCliMessagesImported');
    mocks.imported.mockResolvedValue({ imported: 3 });
    await ensureCliConversationReady('cli-a');
    expect(mocks.emit).toHaveBeenCalledExactlyOnceWith('chat.history.refresh');
  });

  it('does not refresh when there were no new rows', async () => {
    const { ensureCliConversationReady } = await import('@/renderer/ace/ensureCliMessagesImported');
    mocks.imported.mockResolvedValue({ imported: 0 });
    await ensureCliConversationReady('cli-a');
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('tolerates a failed import without a misleading refresh', async () => {
    const { ensureCliConversationReady } = await import('@/renderer/ace/ensureCliMessagesImported');
    mocks.imported.mockRejectedValue(new Error('unreadable source'));
    await ensureCliConversationReady('cli-a');
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
