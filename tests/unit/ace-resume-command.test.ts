/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for `buildCliResumeCommand` — the copyable terminal resume command
 * (`claude --resume <id>` etc.) surfaced in the conversation header for CLI-imported
 * conversations. Verifies per-source command syntax and the null cases.
 */

import type { TChatConversation } from '@/common/config/storage';
import { backendToCliSource, buildResumeCommand } from '@/common/ace/resumeCommand';
import { resumeCommandForConversation } from '@/process/ace/sessionFiles';
import { buildCliResumeCommand } from '@/renderer/ace/readonly';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// Minimal conversation factory — only `extra` matters for the command builder.
function conv(extra: Record<string, unknown> | undefined): TChatConversation {
  return { extra } as unknown as TChatConversation;
}

describe('buildCliResumeCommand', () => {
  const ID = '7f1eca72-c7cf-40dd-866c-f04ce5231042';

  it('builds the claude command for claude-code sessions', () => {
    expect(buildCliResumeCommand(conv({ cli_session_id: ID, cli_source: 'claude-code' }))).toBe(
      `claude --resume ${ID}`
    );
  });

  it('builds the codex command for codex sessions', () => {
    expect(buildCliResumeCommand(conv({ cli_session_id: ID, cli_source: 'codex' }))).toBe(`codex resume ${ID}`);
  });

  it('builds the gemini command for gemini sessions', () => {
    expect(buildCliResumeCommand(conv({ cli_session_id: ID, cli_source: 'gemini' }))).toBe(`gemini --resume ${ID}`);
  });

  it('builds the opencode command for opencode sessions', () => {
    expect(buildCliResumeCommand(conv({ cli_session_id: ID, cli_source: 'opencode' }))).toBe(`opencode -s ${ID}`);
  });

  it('returns null when there is no captured cli_session_id', () => {
    expect(buildCliResumeCommand(conv({ cli_source: 'claude-code' }))).toBeNull();
    expect(buildCliResumeCommand(conv({ backend: 'claude' }))).toBeNull();
  });

  it('returns null when cli_source is missing or unknown', () => {
    expect(buildCliResumeCommand(conv({ cli_session_id: ID }))).toBeNull();
    expect(buildCliResumeCommand(conv({ cli_session_id: ID, cli_source: 'unknown-cli' }))).toBeNull();
  });

  it('returns null for null/undefined conversations and empty extra', () => {
    expect(buildCliResumeCommand(null)).toBeNull();
    expect(buildCliResumeCommand(undefined)).toBeNull();
    expect(buildCliResumeCommand(conv(undefined))).toBeNull();
  });
});

describe('backendToCliSource', () => {
  it('maps the claude ACP backend to the claude-code CLI source', () => {
    expect(backendToCliSource('claude')).toBe('claude-code');
    expect(backendToCliSource('claude-code')).toBe('claude-code');
  });

  it('passes through codex / gemini / opencode backends', () => {
    expect(backendToCliSource('codex')).toBe('codex');
    expect(backendToCliSource('gemini')).toBe('gemini');
    expect(backendToCliSource('opencode')).toBe('opencode');
  });

  it('returns null for unknown / empty backends', () => {
    expect(backendToCliSource('aionrs')).toBeNull();
    expect(backendToCliSource('')).toBeNull();
    expect(backendToCliSource(null)).toBeNull();
    expect(backendToCliSource(undefined)).toBeNull();
  });
});

describe('buildResumeCommand', () => {
  const ID = '7f1eca72-c7cf-40dd-866c-f04ce5231042';

  it('builds per-source commands', () => {
    expect(buildResumeCommand('claude-code', ID)).toBe(`claude --resume ${ID}`);
    expect(buildResumeCommand('opencode', ID)).toBe(`opencode -s ${ID}`);
  });

  it('returns null when source or session id is missing', () => {
    expect(buildResumeCommand(null, ID)).toBeNull();
    expect(buildResumeCommand('claude-code', null)).toBeNull();
    expect(buildResumeCommand('claude-code', undefined)).toBeNull();
  });
});

describe('resumeCommandForConversation (app-created acp_session route)', () => {
  const ID = '3bde1ea7-0943-4ffd-b62f-711d690d9911';

  function acpDb(
    rows: Array<{ conversation_id: string; session_id: string | null; agent_backend: string }>
  ): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE acp_session (conversation_id TEXT PRIMARY KEY, session_id TEXT, agent_backend TEXT)');
    for (const r of rows) {
      db.prepare('INSERT INTO acp_session (conversation_id, session_id, agent_backend) VALUES (?, ?, ?)').run(
        r.conversation_id,
        r.session_id,
        r.agent_backend
      );
    }
    return db;
  }

  it('builds the claude command from a native claude session row', () => {
    const db = acpDb([{ conversation_id: 'conv1', session_id: ID, agent_backend: 'claude' }]);
    expect(resumeCommandForConversation(db, 'conv1')).toBe(`claude --resume ${ID}`);
  });

  it('returns null when the session id is not yet assigned', () => {
    const db = acpDb([{ conversation_id: 'conv1', session_id: null, agent_backend: 'claude' }]);
    expect(resumeCommandForConversation(db, 'conv1')).toBeNull();
  });

  it('returns null when there is no acp_session row', () => {
    const db = acpDb([]);
    expect(resumeCommandForConversation(db, 'missing')).toBeNull();
  });

  it('returns null for a non-CLI backend', () => {
    const db = acpDb([{ conversation_id: 'conv1', session_id: ID, agent_backend: 'aionrs' }]);
    expect(resumeCommandForConversation(db, 'conv1')).toBeNull();
  });
});
