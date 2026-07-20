/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Import-scope filters for the Claude Code session parser:
 *  - command-only transcripts (e.g. a runaway `/clear` loop) must not import
 *  - sessions without any assistant reply must not import
 *  - AionUi's own project dirs (its ACP transcripts) are excluded entirely
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isAionUiInternalProjectDir, parseSessionFile } from '@/process/ace/parsers/claudeParser';
import { isDerivedCodexThread, parseRolloutFile } from '@/process/ace/parsers/codexParser';

const dir = mkdtempSync(join(tmpdir(), 'ace-import-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeSession(name: string, lines: object[]): string {
  const p = join(dir, `${name}.jsonl`);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return p;
}

const TS = '2026-07-03T01:00:00.000Z';
const CWD = '/Users/someone/project';

const userText = (text: string) => ({
  type: 'user',
  cwd: CWD,
  timestamp: TS,
  message: { role: 'user', content: [{ type: 'text', text }] },
});
const assistantText = (text: string) => ({
  type: 'assistant',
  timestamp: TS,
  message: { role: 'assistant', content: [{ type: 'text', text }] },
});

describe('parseSessionFile interactive-session filter', () => {
  it('imports a real user↔assistant exchange', () => {
    const p = writeSession('real', [userText('帮我修一个 bug'), assistantText('好的，先看代码')]);
    const meta = parseSessionFile(p);
    expect(meta).not.toBeNull();
    expect(meta?.title).toBe('帮我修一个 bug');
    expect(meta?.workspace).toBe(CWD);
  });

  it('rejects a /clear-only command transcript (no assistant, no real prompt)', () => {
    const p = writeSession('clear-storm', [
      { type: 'mode', mode: 'normal', sessionId: 'x' },
      { type: 'file-history-snapshot' },
      userText('<local-command-caveat>Caveat: local commands…</local-command-caveat>'),
      userText('<command-name>/clear</command-name>'),
      { type: 'system', subtype: 'local_command', timestamp: TS, cwd: CWD },
    ]);
    expect(parseSessionFile(p)).toBeNull();
  });

  it('rejects a session whose only user text is command/injection-wrapped', () => {
    const p = writeSession('cmd-only', [userText('<command-name>/compact</command-name>'), assistantText('compacted')]);
    expect(parseSessionFile(p)).toBeNull();
  });

  it('rejects a session with a real prompt but no assistant reply', () => {
    const p = writeSession('no-reply', [userText('hello there')]);
    expect(parseSessionFile(p)).toBeNull();
  });
});

describe('isAionUiInternalProjectDir', () => {
  it('excludes AionUi app-support conversation workspaces (prod and dev)', () => {
    expect(
      isAionUiInternalProjectDir('-Users-wmm-Library-Application-Support-AionUi-Dev-aionui-conversations-2026-07-03')
    ).toBe(true);
    expect(
      isAionUiInternalProjectDir('-Users-wmm-Library-Application-Support-AionUi-aionui-conversations-2026-01-01')
    ).toBe(true);
  });

  it('excludes .aionui work dirs', () => {
    expect(isAionUiInternalProjectDir('-Users-wmm--aionui-dev-runtime')).toBe(true);
  });

  it('keeps normal project dirs', () => {
    expect(isAionUiInternalProjectDir('-Users-wmm-wmm-code-dappworks-ai-ops-ai-old-claude')).toBe(false);
  });
});

describe('Codex derived-thread filter', () => {
  it('detects parent/fork/subagent session_meta payloads', () => {
    expect(isDerivedCodexThread({ parent_thread_id: 'parent-1' })).toBe(true);
    expect(isDerivedCodexThread({ forked_from_id: 'parent-1' })).toBe(true);
    expect(isDerivedCodexThread({ thread_source: 'subagent' })).toBe(true);
    expect(isDerivedCodexThread({ source: { subagent: { thread_spawn: {} } } })).toBe(true);
    expect(isDerivedCodexThread({ id: 'root', thread_source: 'user', cwd: '/tmp' })).toBe(false);
  });

  it('skips fork/subagent rollouts and keeps root user threads', () => {
    const rootId = '11111111-1111-1111-1111-111111111111';
    const forkId = '22222222-2222-2222-2222-222222222222';
    const root = writeSession('codex-root', [
      {
        type: 'session_meta',
        payload: {
          id: rootId,
          cwd: CWD,
          timestamp: TS,
          thread_source: 'user',
        },
      },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'root prompt' }] } },
    ]);
    // writeSession writes .jsonl without rollout- prefix; parseRolloutFile only needs content.
    const fork = writeSession('codex-fork', [
      {
        type: 'session_meta',
        payload: {
          id: forkId,
          cwd: CWD,
          timestamp: TS,
          parent_thread_id: rootId,
          forked_from_id: rootId,
          thread_source: 'subagent',
          source: { subagent: { thread_spawn: { parent_thread_id: rootId, depth: 1 } } },
        },
      },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'root prompt' }] } },
    ]);

    const rootMeta = parseRolloutFile(root);
    expect(rootMeta).not.toBeNull();
    expect(rootMeta?.sessionId).toBe(rootId);
    expect(rootMeta?.title).toBe('root prompt');

    expect(parseRolloutFile(fork)).toBeNull();
  });
});
