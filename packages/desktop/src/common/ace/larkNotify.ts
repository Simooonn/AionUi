/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for the Lark group-notification feature, shared by the
 * renderer (snapshot assembly) and the main process (message formatting).
 * No Electron / DOM / Node imports — directly unit-testable.
 */

import type { LarkNotifyRow, LarkNotifyStatus } from './types';
import { LARK_NOTIFY_STATUS_WEIGHT } from './types';

/** Sessions whose last message is older than this are excluded from the list. */
export const LARK_NOTIFY_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Fixed debounce window: first trigger starts it, expiry sends one snapshot. */
export const LARK_NOTIFY_DEBOUNCE_MS = 2_000;
/** Model input cap for the per-row summary (chars, applied renderer-side). */
export const LARK_NOTIFY_SUMMARY_INPUT_CAP = 2000;
/** Summary output fallback: truncate the raw user message to this many chars. */
export const LARK_NOTIFY_SUMMARY_FALLBACK_CHARS = 30;
/** Hard cap on rendered rows; the rest collapses into a trailing "…还有 N 条". */
export const LARK_NOTIFY_MAX_ROWS = 30;
/** Session name display cap (code units); longer names truncate with '…'. */
export const LARK_NOTIFY_NAME_MAX_CHARS = 15;
/** Rows whose last activity is older than this lose the colored status dot. */
export const LARK_NOTIFY_STATUS_DOT_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Turn states that open/feed the notification window ('stopped' is excluded). */
export const LARK_NOTIFY_TRIGGER_STATES: ReadonlySet<string> = new Set([
  'ai_waiting_input',
  'ai_waiting_confirmation',
  'error',
]);

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/**
 * Seconds-tier friendly time for notification rows ("2 秒前 / 3 分钟前 / 2 小时前").
 * The list itself is bounded to 24h, so no day tier is needed; degenerate
 * inputs render as empty string (row shows no time).
 */
export const formatNotifyTime = (activityMs: number, nowMs: number): string => {
  if (!Number.isFinite(activityMs) || activityMs <= 0 || !Number.isFinite(nowMs)) {
    return '';
  }
  const diffMs = Math.max(0, nowMs - activityMs);
  if (diffMs < MINUTE_MS) {
    return `${Math.floor(diffMs / 1000)} 秒前`;
  }
  if (diffMs < HOUR_MS) {
    return `${Math.floor(diffMs / MINUTE_MS)} 分钟前`;
  }
  return `${Math.floor(diffMs / HOUR_MS)} 小时前`;
};

/** Fixed-Chinese status texts (message body is intentionally not i18n'd). */
export const LARK_NOTIFY_STATUS_TEXT: Record<LarkNotifyStatus, string> = {
  waiting_decision: '待决策',
  error: '出错',
  generating: '进行中',
  done: '已完成',
};

/** Colored status dot, shown only for rows active within the dot window. */
export const LARK_NOTIFY_STATUS_DOT: Record<LarkNotifyStatus, string> = {
  waiting_decision: '🟡',
  error: '🔴',
  generating: '🔵',
  done: '🟢',
};

/** Truncate a session name to the display cap, appending '…' when cut. */
export const truncateNotifyName = (name: string): string => {
  return name.length > LARK_NOTIFY_NAME_MAX_CHARS ? `${name.slice(0, LARK_NOTIFY_NAME_MAX_CHARS)}…` : name;
};

/** Last path segment of the workspace ("" when the path is empty/degenerate). */
export const workspaceTail = (workspace: string): string => {
  const segments = workspace.split(/[/\\]/).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
};

/** True when a session's last activity is within the 24h window. */
export const isWithinActiveWindow = (activityMs: number, nowMs: number): boolean => {
  return activityMs > 0 && nowMs - activityMs <= LARK_NOTIFY_ACTIVE_WINDOW_MS;
};

/** Status-weight sort (user-locked order), newest first within the same status. */
export const sortNotifyRows = (rows: LarkNotifyRow[]): LarkNotifyRow[] => {
  return [...rows].toSorted((a, b) => {
    const w = LARK_NOTIFY_STATUS_WEIGHT[a.status] - LARK_NOTIFY_STATUS_WEIGHT[b.status];
    if (w !== 0) return w;
    return b.activity_time - a.activity_time;
  });
};

/**
 * Resolve a session's display status. Current generation supersedes a stale
 * terminal record (a new turn may have started after the recorded state).
 */
export const resolveNotifyStatus = (
  conversation_id: string,
  generatingIds: ReadonlySet<string>,
  lastTerminalState: string | undefined
): LarkNotifyStatus => {
  if (generatingIds.has(conversation_id)) return 'generating';
  if (lastTerminalState === 'ai_waiting_confirmation') return 'waiting_decision';
  if (lastTerminalState === 'error') return 'error';
  return 'done';
};

/** Lark interactive-card payload sent with msg_type 'interactive'. */
export type LarkCard = {
  config: { wide_screen_mode: boolean };
  header: { title: { tag: 'plain_text'; content: string }; template: string };
  elements: Array<{ tag: 'div'; text: { tag: 'lark_md'; content: string } }>;
};

/**
 * Build the Lark interactive card. `summaries` maps conversation_id → final
 * summary line (already cached/fallback-resolved by the caller).
 */
export const buildLarkCard = (
  rows: LarkNotifyRow[],
  summaries: ReadonlyMap<string, string>,
  nowMs: number
): LarkCard => {
  const sorted = sortNotifyRows(rows);
  const shown = sorted.slice(0, LARK_NOTIFY_MAX_ROWS);
  const lines: string[] = [];
  shown.forEach((row, i) => {
    const time = formatNotifyTime(row.activity_time, nowMs);
    const total = row.total === null ? '?' : String(row.total);
    // Stale rows (older than the dot window) keep only the status text —
    // the colored dot is reserved for recent activity.
    const recent = nowMs - row.activity_time <= LARK_NOTIFY_STATUS_DOT_WINDOW_MS;
    const status = recent
      ? `${LARK_NOTIFY_STATUS_DOT[row.status]} ${LARK_NOTIFY_STATUS_TEXT[row.status]}`
      : LARK_NOTIFY_STATUS_TEXT[row.status];
    const tail = workspaceTail(row.workspace);
    // Iconized meta line; absent fields drop out together with their separator
    const meta = [
      row.backend ? `🤖 ${row.backend}` : '',
      time ? `🕒 ${time}` : '',
      `💬 ${total} 条`,
      status,
      tail ? `📁 ${tail}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    // Second line: "name：summary" (truncated name alone when no summary yet)
    const name = truncateNotifyName(row.name);
    const summary = summaries.get(row.conversation_id) || '';
    const detail = name && summary ? `${name}：${summary}` : summary || name;
    lines.push(detail ? `**${i + 1}. ${meta}**\n${detail}` : `**${i + 1}. ${meta}**`);
  });
  if (sorted.length > shown.length) {
    lines.push(`…还有 ${sorted.length - shown.length} 条`);
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `AionUi 会话动态（近 24 小时，共 ${sorted.length} 个）` },
      template: 'blue',
    },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } }],
  };
};

/**
 * Collapse a turnCompleted event to the state recorded in the trigger's
 * terminal registry: a positive pending-confirmation count means the agent is
 * waiting for a human decision even if `state` says otherwise.
 */
export const normalizeTerminalState = (state: string, pendingConfirmations: number): string => {
  return pendingConfirmations > 0 ? 'ai_waiting_confirmation' : state;
};

/** Run `fn` over `items` with at most `limit` concurrent executions, order-preserving. */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length }) as R[];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};
