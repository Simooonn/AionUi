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
import { buildCliResumeCommand } from '@/renderer/ace/readonly';
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
