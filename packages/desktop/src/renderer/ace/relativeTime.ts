/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { I18nKey } from '@/renderer/services/i18n/i18n-keys';

/**
 * Pure relative-time formatter for sidebar conversation rows.
 *
 * Ladder (locked by spec): <1min justNow / <1h minutes / <24h hours /
 * <7d days / <1mo weeksAgo / <1y monthsAgo / >=1y yearsAgo.
 * Fixed divisors: week = floor(days/7), month = floor(days/30) capped at 11,
 * year = floor(days/365).
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type TranslateFn = (key: I18nKey, options?: { count: number }) => string;

/**
 * Format the distance between `activityMs` and `nowMs` as a friendly label.
 * Returns an empty string for degenerate inputs (non-finite or <= 0 timestamps)
 * so callers can simply hide the label.
 */
export const formatRelativeTime = (activityMs: number, nowMs: number, t: TranslateFn): string => {
  if (!Number.isFinite(activityMs) || activityMs <= 0 || !Number.isFinite(nowMs)) {
    return '';
  }
  const diffMs = nowMs - activityMs;
  if (diffMs < MINUTE_MS) {
    return t('conversation.time.justNow');
  }
  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 60) {
    return t('conversation.time.minutes', { count: minutes });
  }
  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) {
    return t('conversation.time.hours', { count: hours });
  }
  const days = Math.floor(diffMs / DAY_MS);
  if (days < 7) {
    return t('conversation.time.days', { count: days });
  }
  if (days < 30) {
    return t('conversation.time.weeksAgo', { count: Math.floor(days / 7) });
  }
  if (days < 365) {
    // Cap at 11 so 360-364 days never renders as "12 months ago"
    return t('conversation.time.monthsAgo', { count: Math.min(11, Math.floor(days / 30)) });
  }
  return t('conversation.time.yearsAgo', { count: Math.floor(days / 365) });
};
