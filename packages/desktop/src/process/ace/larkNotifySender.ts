/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process Lark sender: tenant token cache, group text message, per-row
 * AI summary. Credentials/config are passed in by the IPC layer (aceBridge)
 * so this module stays free of Electron imports and unit-testable.
 *
 * Failure policy: best-effort everywhere — any error degrades silently
 * (console + {ok:false}); the next debounce window self-heals.
 */

import { ClientFactory } from '@/common/api/ClientFactory';
import { ipcBridge } from '@/common';
import type { AceLarkNotifyConfig, LarkNotifyRow } from '@/common/ace/types';
import {
  LARK_NOTIFY_MAX_ROWS,
  LARK_NOTIFY_SUMMARY_FALLBACK_CHARS,
  LARK_NOTIFY_SUMMARY_INPUT_CAP,
  formatLarkMessage,
  mapWithConcurrency,
  sortNotifyRows,
} from '@/common/ace/larkNotify';
import type { TProviderWithModel } from '@/common/config/storage';

const LARK_API_BASES = {
  feishu: 'https://open.feishu.cn/open-apis',
  lark: 'https://open.larksuite.com/open-apis',
} as const;

/** Resolve the REST base for the platform the app was created on. */
const apiBase = (config: AceLarkNotifyConfig): string => LARK_API_BASES[config.domain ?? 'feishu'];
/** Refresh the tenant token this long before Lark's reported expiry. */
const TOKEN_EARLY_REFRESH_MS = 5 * 60_000;
const SUMMARY_TIMEOUT_MS = 8_000;
const SUMMARY_CACHE_LIMIT = 500;
/** Lark auth error codes that warrant one forced token refresh + retry. */
const LARK_AUTH_ERROR_CODES = new Set([99991661, 99991663, 99991664, 99991665, 99991668]);

type FetchLike = typeof fetch;

let tokenCache: { key: string; token: string; expireAt: number } | null = null;
let tokenInflight: Promise<string | null> | null = null;
const summaryCache = new Map<string, string>();

/** Drop the cached/in-flight tenant token (called when credentials change). */
export const resetLarkTokenCache = (): void => {
  tokenCache = null;
  tokenInflight = null;
};

/** Test hook: reset module-level caches between unit tests. */
export const _resetLarkNotifyStateForTests = (): void => {
  resetLarkTokenCache();
  summaryCache.clear();
};

/**
 * Fetch (or reuse) the tenant_access_token. Concurrent first calls share one
 * in-flight request; `force` bypasses both the cache AND any in-flight fetch
 * (which may belong to stale credentials).
 */
export const getTenantToken = async (
  config: AceLarkNotifyConfig,
  options?: { force?: boolean; fetchImpl?: FetchLike }
): Promise<string | null> => {
  const f = options?.fetchImpl ?? fetch;
  const key = `${config.domain ?? 'feishu'}:${config.app_id}`;
  if (!options?.force && tokenCache && tokenCache.key === key && tokenCache.expireAt > Date.now()) {
    return tokenCache.token;
  }
  if (!options?.force && tokenInflight) {
    return tokenInflight;
  }
  tokenInflight = (async () => {
    try {
      const resp = await f(`${apiBase(config)}/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: config.app_id, app_secret: config.app_secret }),
      });
      const body = (await resp.json()) as { code?: number; tenant_access_token?: string; expire?: number };
      if (!resp.ok || body.code !== 0 || !body.tenant_access_token) {
        console.warn('[larkNotify] tenant token fetch failed:', body.code);
        return null;
      }
      const ttlMs = Math.max(60_000, (body.expire ?? 7200) * 1000 - TOKEN_EARLY_REFRESH_MS);
      tokenCache = { key, token: body.tenant_access_token, expireAt: Date.now() + ttlMs };
      return body.tenant_access_token;
    } catch (e) {
      console.warn('[larkNotify] tenant token fetch error:', e instanceof Error ? e.message : e);
      return null;
    } finally {
      tokenInflight = null;
    }
  })();
  return tokenInflight;
};

/** Send a plain-text message to the configured group chat. Retries once on auth errors. */
export const sendLarkText = async (
  config: AceLarkNotifyConfig,
  content: string,
  fetchImpl?: FetchLike
): Promise<{ ok: boolean; reason?: string }> => {
  const f = fetchImpl ?? fetch;
  const post = async (token: string) => {
    const resp = await f(`${apiBase(config)}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        receive_id: config.chat_id,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }),
    });
    const body = (await resp.json().catch(() => ({}))) as { code?: number; msg?: string };
    return { status: resp.status, code: body.code ?? -1, msg: body.msg };
  };

  let token = await getTenantToken(config, { fetchImpl: f });
  if (!token) return { ok: false, reason: 'token-unavailable' };
  let result = await post(token);
  if (result.status === 401 || LARK_AUTH_ERROR_CODES.has(result.code)) {
    token = await getTenantToken(config, { force: true, fetchImpl: f });
    if (!token) return { ok: false, reason: 'token-unavailable' };
    result = await post(token);
  }
  if (result.code !== 0) {
    console.warn('[larkNotify] send failed:', result.status, result.code, result.msg);
    return { ok: false, reason: `lark-${result.code}` };
  }
  return { ok: true };
};

const truncateSummary = (text: string): string => text.slice(0, LARK_NOTIFY_SUMMARY_FALLBACK_CHARS);

const resolveSummaryProvider = async (config: AceLarkNotifyConfig): Promise<TProviderWithModel | null> => {
  const selected = config.summary_provider;
  if (!selected?.id || !selected.use_model) return null;
  try {
    const providers = await ipcBridge.mode.listProviders.invoke();
    const provider = providers?.find((p) => p.id === selected.id);
    if (!provider) return null;
    return { ...provider, use_model: selected.use_model };
  } catch {
    return null;
  }
};

/** Conversation-scoped cache key (message ids are not proven globally unique). */
const summaryCacheKey = (row: LarkNotifyRow): string =>
  `${row.conversation_id}:${(row.last_user_message as { id: string }).id}`;

const rememberSummary = (key: string, summary: string): void => {
  if (summaryCache.size >= SUMMARY_CACHE_LIMIT) {
    // Evict the oldest entry only (Map preserves insertion order) — a bulk
    // clear would force re-summarizing everything on the next window
    const oldest = summaryCache.keys().next().value;
    if (oldest !== undefined) summaryCache.delete(oldest);
  }
  summaryCache.set(key, summary);
};

const SUMMARY_CONCURRENCY = 5;

/**
 * Resolve a 5-30 char summary for every row that carries a last user message.
 * Cache key = conversation:message id (one model call per distinct message).
 * Any failure falls back to the truncated raw text — the notification always sends.
 */
export const summarizeRows = async (
  config: AceLarkNotifyConfig,
  rows: LarkNotifyRow[]
): Promise<Map<string, string>> => {
  const summaries = new Map<string, string>();
  const pending: LarkNotifyRow[] = [];
  for (const row of rows) {
    if (!row.last_user_message?.text) continue;
    const cached = summaryCache.get(summaryCacheKey(row));
    if (cached) {
      summaries.set(row.conversation_id, cached);
    } else {
      pending.push(row);
    }
  }
  if (!pending.length) return summaries;

  const provider = await resolveSummaryProvider(config);
  await mapWithConcurrency(pending, SUMMARY_CONCURRENCY, async (row) => {
    const msg = row.last_user_message as { id: string; text: string };
    // Re-apply the input cap at this trust boundary (renderer cap is advisory)
    const safeText = msg.text.slice(0, LARK_NOTIFY_SUMMARY_INPUT_CAP);
    let summary = truncateSummary(safeText);
    if (provider) {
      try {
        const client = await ClientFactory.createRotatingClient(provider);
        const completion = await client.createChatCompletion(
          {
            model: provider.use_model,
            messages: [
              {
                role: 'user',
                content: `用5到30个字的中文短语总结下面这条用户消息在做什么，只输出短语本身：\n${safeText}`,
              },
            ],
          },
          { timeout: SUMMARY_TIMEOUT_MS }
        );
        const text = completion.choices?.[0]?.message?.content?.trim();
        if (text) {
          summary = text.slice(0, 30);
        }
      } catch (e) {
        console.warn('[larkNotify] summary failed, falling back to truncation:', e instanceof Error ? e.message : e);
      }
    }
    rememberSummary(summaryCacheKey(row), summary);
    summaries.set(row.conversation_id, summary);
  });
  return summaries;
};

/** Full pipeline used by the IPC handler: summarize (visible rows only) → format → send. */
export const sendLarkNotification = async (
  config: AceLarkNotifyConfig,
  rows: LarkNotifyRow[]
): Promise<{ ok: boolean; reason?: string }> => {
  if (!rows.length) return { ok: false, reason: 'empty' };
  const sorted = sortNotifyRows(rows);
  // Only the rows that will actually render (30-row cap) get a model call
  const summaries = await summarizeRows(config, sorted.slice(0, LARK_NOTIFY_MAX_ROWS));
  const content = formatLarkMessage(sorted, summaries, Date.now());
  return sendLarkText(config, content);
};
