/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../packages/desktop/src/renderer/ace/relativeTime';

// zh-CN stub mirroring locales/zh-CN/conversation.json `time` section,
// including the mixed-suffix style (no 前 on minutes/hours/days; 前 on weeks/months/years)
const ZH: Record<string, string> = {
  'conversation.time.justNow': '刚刚',
  'conversation.time.minutes': '{{count}} 分钟',
  'conversation.time.hours': '{{count}} 小时',
  'conversation.time.days': '{{count}} 天',
  'conversation.time.weeksAgo': '{{count}} 周前',
  'conversation.time.monthsAgo': '{{count}} 月前',
  'conversation.time.yearsAgo': '{{count}} 年前',
};

const t = (key: string, options?: { count: number }): string => {
  const template = ZH[key];
  if (!template) throw new Error(`unknown i18n key: ${key}`);
  return template.replace('{{count}}', String(options?.count));
};

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
// Arbitrary fixed epoch (~2026-05-29); keeps tests deterministic (no Date.now())
const NOW = 1_780_000_000_000;

const fmt = (diffMs: number) => formatRelativeTime(NOW - diffMs, NOW, t);

describe('formatRelativeTime ladder boundaries (fixed divisors)', () => {
  it('< 1 minute renders justNow', () => {
    expect(fmt(0)).toBe('刚刚');
    expect(fmt(59 * 1000)).toBe('刚刚');
  });

  it('< 1 hour renders minutes (no 前 suffix)', () => {
    expect(fmt(60 * 1000)).toBe('1 分钟');
    expect(fmt(59 * MINUTE)).toBe('59 分钟');
  });

  it('< 24 hours renders hours (no 前 suffix)', () => {
    expect(fmt(60 * MINUTE)).toBe('1 小时');
    expect(fmt(23 * HOUR)).toBe('23 小时');
  });

  it('< 7 days renders days (no 前 suffix)', () => {
    expect(fmt(24 * HOUR)).toBe('1 天');
    expect(fmt(6 * DAY)).toBe('6 天');
    expect(fmt(7 * DAY - 1)).toBe('6 天'); // last ms of the days tier
  });

  it('< 30 days renders weeksAgo with floor(days/7)', () => {
    expect(fmt(7 * DAY)).toBe('1 周前');
    expect(fmt(13 * DAY)).toBe('1 周前');
    expect(fmt(14 * DAY)).toBe('2 周前');
    expect(fmt(27 * DAY)).toBe('3 周前');
    expect(fmt(29 * DAY)).toBe('4 周前');
    expect(fmt(30 * DAY - 1)).toBe('4 周前'); // last ms of the weeks tier
  });

  it('< 365 days renders monthsAgo with floor(days/30)', () => {
    expect(fmt(30 * DAY)).toBe('1 月前');
    expect(fmt(59 * DAY)).toBe('1 月前');
    expect(fmt(60 * DAY)).toBe('2 月前');
    expect(fmt(359 * DAY)).toBe('11 月前');
  });

  it('364 days MUST cap at 11 月前, never 12 月前', () => {
    expect(fmt(360 * DAY)).toBe('11 月前');
    expect(fmt(364 * DAY)).toBe('11 月前');
    expect(fmt(365 * DAY - 1)).toBe('11 月前'); // last ms of the months tier
  });

  it('>= 365 days renders yearsAgo with floor(days/365)', () => {
    expect(fmt(365 * DAY)).toBe('1 年前');
    expect(fmt(729 * DAY)).toBe('1 年前');
    expect(fmt(730 * DAY)).toBe('2 年前');
  });
});

describe('formatRelativeTime degenerate inputs', () => {
  it('returns empty string for zero / negative timestamps (never "56 年前")', () => {
    expect(formatRelativeTime(0, NOW, t)).toBe('');
    expect(formatRelativeTime(-1, NOW, t)).toBe('');
  });

  it('returns empty string for non-finite inputs', () => {
    expect(formatRelativeTime(NaN, NOW, t)).toBe('');
    expect(formatRelativeTime(Infinity, NOW, t)).toBe('');
    expect(formatRelativeTime(NOW, NaN, t)).toBe('');
  });

  it('treats future timestamps (clock skew) as justNow', () => {
    expect(formatRelativeTime(NOW + 5 * MINUTE, NOW, t)).toBe('刚刚');
  });
});
