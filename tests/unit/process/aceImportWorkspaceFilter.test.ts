/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AionUi-internal workspace exclusion for the CLI session import (fork, ace/):
 *  - isAionUiInternalWorkspace: both path forms of the app's own dirs (the
 *    `~/.aionui*` symlink as passed, and the resolved
 *    `~/Library/Application Support/AionUi*` form) are excluded; everything
 *    else — including OS temp dirs — is still importable
 *  - filterImportableSessions: pure filter shared by scan and import
 *  - scanCliSessions / importCliSessions: internal sessions never reach
 *    `conversation.create`, and the baseline-abort count only covers
 *    importable sessions
 *
 * The aioncore DB layer is stubbed at the `aioncoreSchema` module boundary
 * (no sqlite needed); the four parsers are stubbed to keep the developer's
 * real ~/.claude, ~/.codex, ~/.gemini and opencode.db out of the test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliSessionMeta, CliSource } from '@/common/ace/types';

// Hoisted so the vi.mock factories below can reference it (they are hoisted above imports).
const h = vi.hoisted(() => {
  /** better-sqlite3 stand-in: the import path only calls pragma() and close(). */
  class NoopDb {
    pragma(): unknown[] {
      return [];
    }
    prepare(): never {
      throw new Error('prepare() must not be reached: aioncoreSchema is stubbed');
    }
    close(): void {}
  }
  const call = () => ({ invoke: vi.fn() });
  return {
    NoopDb,
    schemaOk: true,
    sessions: {
      claude: [] as unknown[],
      codex: [] as unknown[],
      gemini: [] as unknown[],
      opencode: [] as unknown[],
    },
    ipcBridge: {
      conversation: { create: call(), remove: call() },
      database: { getUserConversations: call() },
      sidebar: { deleteArchivedItem: call() },
    },
  };
});

vi.mock('@process/utils', () => ({ getDataPath: () => '/nonexistent/ace-import-workspace-filter' }));
vi.mock('@/common', () => ({ ipcBridge: h.ipcBridge }));
vi.mock('better-sqlite3', () => ({ default: h.NoopDb }));
vi.mock('@process/ace/aioncoreSchema', () => ({
  ACE_IMPORT_BASELINE_SCHEMA: {},
  ACE_IMPORT_DEDUPE_SCHEMA: {},
  hasImportSchema: () => h.schemaOk,
  readImportedCliSessionIds: () => new Set<string>(),
  findDuplicateImportLosers: () => [],
  backfillImportedConversationActivity: () => undefined,
}));
vi.mock('@process/ace/parsers/claudeParser', () => ({ parseClaudeCodeSessions: () => h.sessions.claude }));
vi.mock('@process/ace/parsers/codexParser', () => ({ parseCodexSessions: () => h.sessions.codex }));
vi.mock('@process/ace/parsers/geminiParser', () => ({ parseGeminiSessions: () => h.sessions.gemini }));
vi.mock('@process/ace/parsers/opencodeParser', () => ({ parseOpencodeSessions: () => h.sessions.opencode }));

import {
  filterImportableSessions,
  importCliSessions,
  isAionUiInternalWorkspace,
  scanCliSessions,
} from '@process/ace/importCliSessions';

const NORMAL_WORKSPACE = '/nonexistent/workspace';

const meta = (source: CliSource, sessionId: string, workspace: string): CliSessionMeta => ({
  source,
  sessionId,
  backend: source === 'claude-code' ? 'claude' : source,
  title: `title ${sessionId}`,
  workspace,
  createdAt: 1,
  updatedAt: 2,
});

/** One AionUi-internal + one normal session per CLI; claude/opencode use the resolved path form. */
function mixedSessions(): CliSessionMeta[] {
  return [
    meta('claude-code', 'internal-claude', '/Users/x/Library/Application Support/AionUi/aionui/live-verify'),
    meta('claude-code', 'normal-claude', NORMAL_WORKSPACE),
    meta('codex', 'internal-codex', '/Users/x/.aionui/live-verify'),
    meta('codex', 'normal-codex', NORMAL_WORKSPACE),
    meta('gemini', 'internal-gemini', '/Users/x/.aionui-dev/conversations/g'),
    meta('gemini', 'normal-gemini', NORMAL_WORKSPACE),
    meta('opencode', 'internal-opencode', '/Users/x/Library/Application Support/AionUi-Dev/aionui/o'),
    meta('opencode', 'normal-opencode', NORMAL_WORKSPACE),
  ];
}

const NORMAL_IDS = ['normal-claude', 'normal-codex', 'normal-gemini', 'normal-opencode'];

function setSessions(list: CliSessionMeta[]): void {
  h.sessions.claude = list.filter((m) => m.source === 'claude-code');
  h.sessions.codex = list.filter((m) => m.source === 'codex');
  h.sessions.gemini = list.filter((m) => m.source === 'gemini');
  h.sessions.opencode = list.filter((m) => m.source === 'opencode');
}

const createInvoke = () => h.ipcBridge.conversation.create.invoke;
const createdSessionIds = (): string[] =>
  createInvoke()
    .mock.calls.map(([params]) => (params as { extra: { cli_session_id: string } }).extra.cli_session_id)
    .toSorted();

describe('isAionUiInternalWorkspace', () => {
  it.each([
    ['logical ~/.aionui path', '/Users/x/.aionui/live-verify'],
    ['logical path with trailing slash', '/Users/x/.aionui/live-verify/'],
    ['the ~/.aionui dir itself', '/Users/x/.aionui'],
    ['dev data dir', '/Users/x/.aionui-dev/conversations/abc'],
    // Over-match accepted on purpose: same shape as claudeParser's '--aionui' substring marker.
    ['any .aionui-prefixed segment', '/Users/x/.aionui2/p'],
    // Backslash separators only; the app creates no ~/.aionui link on Windows.
    ['backslash separators', 'C:\\Users\\x\\.aionui\\live-verify'],
    ['resolved prod data dir', '/Users/x/Library/Application Support/AionUi/aionui/live-verify'],
    ['resolved dev data dir', '/Users/x/Library/Application Support/AionUi-Dev/aionui/x'],
    ['resolved path with a doubled slash', '/Users/x/Library//Application Support/AionUi/aionui'],
  ])('excludes %s', (_label, workspace) => {
    expect(isAionUiInternalWorkspace(workspace)).toBe(true);
  });

  it.each([
    ['an ordinary project', '/Users/x/wmm-code/test'],
    ['a name merely containing aionui', '/Users/x/aionui-project'],
    ['a segment ending in .aionui', '/Users/x/my.aionui'],
    ['another app in Application Support', '/Users/x/Library/Application Support/Code/User'],
    ['AionUi nested below another app', '/Users/x/Library/Application Support/Other/AionUi'],
    ['a path that normalises out of .aionui', '/x/.aionui/../proj'],
    // OS temp dirs are deliberately NOT excluded (spec non-goal).
    ['a resolved OS temp dir', '/private/var/folders/w8/T/live-parity-claude-1'],
    ['an as-passed OS temp dir', '/var/folders/w8/T/live-codex-bg-1'],
    ['an undefined workspace', undefined],
    ['an empty workspace', ''],
  ])('keeps %s', (_label, workspace) => {
    expect(isAionUiInternalWorkspace(workspace)).toBe(false);
  });
});

describe('filterImportableSessions', () => {
  it('keeps only the normal sessions, in order, without mutating the input', () => {
    const input = mixedSessions();
    const inputIdsBefore = input.map((m) => m.sessionId);
    const kept = filterImportableSessions(input);
    expect(kept.map((m) => m.sessionId)).toEqual(NORMAL_IDS);
    expect(input.map((m) => m.sessionId)).toEqual(inputIdsBefore);
  });

  it('drops internal sessions recorded in the resolved path form', () => {
    const resolved = mixedSessions().filter((m) => m.workspace?.includes('Application Support'));
    expect(resolved).toHaveLength(2);
    expect(filterImportableSessions(resolved)).toEqual([]);
  });

  it('returns an empty list for all-internal or empty input', () => {
    const internalOnly = mixedSessions().filter((m) => m.sessionId.startsWith('internal-'));
    expect(filterImportableSessions(internalOnly)).toEqual([]);
    expect(filterImportableSessions([])).toEqual([]);
  });
});

describe('scan/import share the exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.schemaOk = true;
    // Empty DB baseline + empty HTTP list = a genuine first import (tripwire passes).
    h.ipcBridge.database.getUserConversations.invoke.mockResolvedValue({ items: [] });
    h.ipcBridge.conversation.create.invoke.mockResolvedValue(undefined);
    setSessions(mixedSessions());
  });

  it('scan counts only importable sessions', async () => {
    expect(await scanCliSessions()).toEqual({
      total: 4,
      bySource: { 'claude-code': 1, codex: 1, gemini: 1, opencode: 1 },
    });
  });

  it('import creates exactly the normal sessions', async () => {
    await importCliSessions({ hasOpenTerminal: () => false });
    expect(createdSessionIds()).toEqual(NORMAL_IDS);
  });

  it('import reports only importable sessions', async () => {
    const result = await importCliSessions({ hasOpenTerminal: () => false });
    expect(result).toMatchObject({ imported: 4, skipped: 0, failed: 0, errors: [] });
  });

  it('a baseline abort counts only importable sessions as failed', async () => {
    h.schemaOk = false;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scan = await scanCliSessions();
    const result = await importCliSessions({ hasOpenTerminal: () => false });
    expect(scan).toBeNull();
    expect(result.failed).toBe(4);
    expect(result.errors[0]).toMatch(/^aborted:/);
  });
});
