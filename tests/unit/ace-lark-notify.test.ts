/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LarkNotifyRow } from '../../packages/desktop/src/common/ace/types';
import {
  LARK_NOTIFY_SUMMARY_INPUT_CAP,
  LARK_NOTIFY_TRIGGER_STATES,
  formatLarkMessage,
  formatNotifyTime,
  isWithinActiveWindow,
  normalizeTerminalState,
  resolveNotifyStatus,
  sortNotifyRows,
} from '../../packages/desktop/src/common/ace/larkNotify';
import { LarkNotifyWindowController } from '../../packages/desktop/src/renderer/ace/larkNotify/windowController';
import { extractLastUserMessage } from '../../packages/desktop/src/renderer/ace/larkNotify/assembleSnapshot';
import {
  _resetLarkNotifyStateForTests,
  getTenantToken,
  sendLarkText,
  summarizeRows,
} from '../../packages/desktop/src/process/ace/larkNotifySender';
import type { AceLarkNotifyConfig } from '../../packages/desktop/src/common/ace/types';
import type { TMessage } from '../../packages/desktop/src/common/chat/chatLib';

const NOW = 1_780_000_000_000; // fixed epoch, keeps tests deterministic

const row = (overrides: Partial<LarkNotifyRow>): LarkNotifyRow => ({
  conversation_id: 'c1',
  name: 'conv',
  backend: 'claude',
  workspace: '/tmp/project',
  activity_time: NOW - 60_000,
  total: 10,
  status: 'done',
  last_user_message: null,
  ...overrides,
});

describe('formatNotifyTime (seconds tier)', () => {
  it('renders seconds under a minute', () => {
    expect(formatNotifyTime(NOW - 2_000, NOW)).toBe('2 秒前');
    expect(formatNotifyTime(NOW - 59_000, NOW)).toBe('59 秒前');
  });
  it('renders minutes under an hour', () => {
    expect(formatNotifyTime(NOW - 60_000, NOW)).toBe('1 分钟前');
    expect(formatNotifyTime(NOW - 59 * 60_000, NOW)).toBe('59 分钟前');
  });
  it('renders hours from one hour up', () => {
    expect(formatNotifyTime(NOW - 3_600_000, NOW)).toBe('1 小时前');
    expect(formatNotifyTime(NOW - 23 * 3_600_000, NOW)).toBe('23 小时前');
  });
  it('returns empty string for degenerate inputs', () => {
    expect(formatNotifyTime(0, NOW)).toBe('');
    expect(formatNotifyTime(-1, NOW)).toBe('');
    expect(formatNotifyTime(NaN, NOW)).toBe('');
  });
});

describe('isWithinActiveWindow (24h boundary)', () => {
  it('includes 23h59m and excludes 24h+1m', () => {
    expect(isWithinActiveWindow(NOW - (24 * 3_600_000 - 60_000), NOW)).toBe(true);
    expect(isWithinActiveWindow(NOW - 24 * 3_600_000, NOW)).toBe(true);
    expect(isWithinActiveWindow(NOW - (24 * 3_600_000 + 60_000), NOW)).toBe(false);
    expect(isWithinActiveWindow(0, NOW)).toBe(false);
  });
});

describe('trigger state set + terminal normalization', () => {
  it('triggers on the three locked states and never on stopped', () => {
    expect(LARK_NOTIFY_TRIGGER_STATES.has('ai_waiting_input')).toBe(true);
    expect(LARK_NOTIFY_TRIGGER_STATES.has('ai_waiting_confirmation')).toBe(true);
    expect(LARK_NOTIFY_TRIGGER_STATES.has('error')).toBe(true);
    expect(LARK_NOTIFY_TRIGGER_STATES.has('stopped')).toBe(false);
  });
  it('pending confirmations override the reported state', () => {
    expect(normalizeTerminalState('ai_waiting_input', 2)).toBe('ai_waiting_confirmation');
    expect(normalizeTerminalState('ai_waiting_input', 0)).toBe('ai_waiting_input');
  });
});

describe('resolveNotifyStatus + sortNotifyRows', () => {
  it('current generation supersedes a stale terminal record', () => {
    expect(resolveNotifyStatus('a', new Set(['a']), 'error')).toBe('generating');
    expect(resolveNotifyStatus('a', new Set(), 'ai_waiting_confirmation')).toBe('waiting_decision');
    expect(resolveNotifyStatus('a', new Set(), 'error')).toBe('error');
    expect(resolveNotifyStatus('a', new Set(), 'stopped')).toBe('done');
    expect(resolveNotifyStatus('a', new Set(), undefined)).toBe('done');
  });
  it('sorts 待决策 > 出错 > 进行中 > 已完成, newest first within a tier', () => {
    const rows = [
      row({ conversation_id: 'done-old', status: 'done', activity_time: NOW - 9_000 }),
      row({ conversation_id: 'gen', status: 'generating', activity_time: NOW - 5_000 }),
      row({ conversation_id: 'err', status: 'error', activity_time: NOW - 7_000 }),
      row({ conversation_id: 'wait', status: 'waiting_decision', activity_time: NOW - 8_000 }),
      row({ conversation_id: 'done-new', status: 'done', activity_time: NOW - 1_000 }),
    ];
    expect(sortNotifyRows(rows).map((r) => r.conversation_id)).toEqual(['wait', 'err', 'gen', 'done-new', 'done-old']);
  });
});

describe('formatLarkMessage', () => {
  it('renders index, all 8 fields, and falls back summary to the name', () => {
    const text = formatLarkMessage(
      [row({ conversation_id: 'c1', name: '修复登录', backend: 'codex', total: 42, status: 'waiting_decision' })],
      new Map([['c1', '排查登录超时问题']]),
      NOW
    );
    expect(text).toContain('1. 🟡 待决策 修复登录 · codex · 1 分钟前');
    expect(text).toContain('排查登录超时问题 ｜ 42 条 ｜ /tmp/project');
  });
  it('renders only the header for empty rows', () => {
    expect(formatLarkMessage([], new Map(), NOW)).toBe('AionUi 会话动态（近 24 小时，共 0 个）');
  });
  it('shows ? for failed totals and caps at 30 rows with a trailing line', () => {
    const rows = Array.from({ length: 33 }, (_, i) =>
      row({ conversation_id: `c${i}`, total: i === 0 ? null : i, activity_time: NOW - i * 1000 })
    );
    const text = formatLarkMessage(rows, new Map(), NOW);
    expect(text).toContain('? 条');
    expect(text).toContain('…还有 3 条');
    expect(text).not.toContain('31.');
  });
});

describe('LarkNotifyWindowController (fixed 60s window)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('absorbs triggers inside the window and fires exactly once at expiry', () => {
    const onExpire = vi.fn();
    const controller = new LarkNotifyWindowController(60_000, onExpire);
    controller.trigger();
    vi.advanceTimersByTime(30_000);
    controller.trigger(); // absorbed, must NOT extend the window
    vi.advanceTimersByTime(29_999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(controller.isOpen).toBe(false);
  });
  it('opens a fresh window after expiry and cancels on dispose', () => {
    const onExpire = vi.fn();
    const controller = new LarkNotifyWindowController(60_000, onExpire);
    controller.trigger();
    vi.advanceTimersByTime(60_000);
    controller.trigger();
    controller.dispose();
    vi.advanceTimersByTime(120_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('extractLastUserMessage', () => {
  const textMessage = (id: string, position: 'left' | 'right', content: unknown): TMessage =>
    ({ id, type: 'text', position, conversation_id: 'c', msg_id: id, content }) as unknown as TMessage;

  it('picks the first user text row from a DESC page and collapses whitespace', () => {
    const items = [
      textMessage('a1', 'left', { content: 'assistant reply' }),
      textMessage('u2', 'right', { content: '  帮我\n修复  登录bug  ' }),
      textMessage('u1', 'right', { content: 'older user message' }),
    ];
    expect(extractLastUserMessage(items)).toEqual({ id: 'u2', text: '帮我 修复 登录bug' });
  });
  it('caps the extracted text at the summary input limit', () => {
    const items = [textMessage('u1', 'right', { content: 'x'.repeat(LARK_NOTIFY_SUMMARY_INPUT_CAP + 500) })];
    expect(extractLastUserMessage(items)?.text.length).toBe(LARK_NOTIFY_SUMMARY_INPUT_CAP);
  });
  it('returns null when there is no usable user text', () => {
    expect(extractLastUserMessage(undefined)).toBeNull();
    expect(extractLastUserMessage([])).toBeNull();
    expect(extractLastUserMessage([textMessage('a', 'left', { content: 'reply' })])).toBeNull();
    expect(extractLastUserMessage([textMessage('u', 'right', { content: '   ' })])).toBeNull();
  });
  it('skips non-string (multimodal/structured) content instead of stringifying it', () => {
    const items = [
      textMessage('u2', 'right', { content: [{ type: 'text', text: 'part' }] }),
      textMessage('u1', 'right', { content: 'plain older message' }),
    ];
    expect(extractLastUserMessage(items)).toEqual({ id: 'u1', text: 'plain older message' });
  });
});

describe('larkNotifySender (injected fetch)', () => {
  const config: AceLarkNotifyConfig = {
    enabled: true,
    app_id: 'cli_test',
    app_secret: 'secret',
    chat_id: 'oc_test',
  };

  beforeEach(() => _resetLarkNotifyStateForTests());

  const tokenResponse = (token: string, code = 0) =>
    ({ ok: true, status: 200, json: async () => ({ code, tenant_access_token: token, expire: 7200 }) }) as Response;
  const sendResponse = (code = 0, status = 200) =>
    ({ ok: status === 200, status, json: async () => ({ code, msg: code === 0 ? 'ok' : 'err' }) }) as Response;

  it('deduplicates concurrent first token fetches (in-flight guard) and caches the result', async () => {
    const fetchImpl = vi.fn(async () => tokenResponse('t1'));
    const [a, b] = await Promise.all([getTenantToken(config, { fetchImpl }), getTenantToken(config, { fetchImpl })]);
    expect(a).toBe('t1');
    expect(b).toBe('t1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await getTenantToken(config, { fetchImpl })).toBe('t1'); // cache hit
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('routes token requests to the larksuite domain when domain=lark', async () => {
    const intlConfig: AceLarkNotifyConfig = { ...config, domain: 'lark' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain('https://open.larksuite.com/open-apis');
      return tokenResponse('t-intl');
    });
    expect(await getTenantToken(intlConfig, { fetchImpl })).toBe('t-intl');
    // Same app_id on the other platform must NOT reuse the cached intl token
    const feishuFetch = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain('https://open.feishu.cn/open-apis');
      return tokenResponse('t-cn');
    });
    expect(await getTenantToken(config, { fetchImpl: feishuFetch })).toBe('t-cn');
  });

  it('force bypasses the cached token (fresh credentials take effect immediately)', async () => {
    const fetchA = vi.fn(async () => tokenResponse('tA'));
    expect(await getTenantToken(config, { fetchImpl: fetchA })).toBe('tA');
    const fetchB = vi.fn(async () => tokenResponse('tB'));
    expect(await getTenantToken(config, { force: true, fetchImpl: fetchB })).toBe('tB');
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('retries the send exactly once with a fresh token on auth errors', async () => {
    let tokenCalls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('tenant_access_token')) {
        tokenCalls += 1;
        return tokenResponse(`t${tokenCalls}`);
      }
      // First send hits an auth error, second succeeds
      return fetchImpl.mock.calls.filter((c) => String(c[0]).includes('im/v1/messages')).length === 1
        ? sendResponse(99991663)
        : sendResponse(0);
    });
    const result = await sendLarkText(config, 'hello', fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(tokenCalls).toBe(2);
  });

  it('summarizes with truncation fallback (no provider) and caches by message id', async () => {
    const rows = [
      row({
        conversation_id: 'c1',
        last_user_message: {
          id: 'm1',
          text: '这是一条很长的用户消息，需要被截断成三十个字以内作为摘要兜底使用，超出部分丢弃',
        },
      }),
    ];
    const first = await summarizeRows(config, rows);
    expect(first.get('c1')).toHaveLength(30);
    // Second call resolves purely from the message-id cache
    const second = await summarizeRows(config, rows);
    expect(second.get('c1')).toBe(first.get('c1'));
  });
});
