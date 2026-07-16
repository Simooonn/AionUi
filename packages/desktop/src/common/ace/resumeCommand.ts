/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared builder for the terminal command that resumes an underlying CLI
 * session (e.g. `claude --resume <id>`). Used by both the renderer (imported
 * conversations, synchronously from extra) and the main process (app-created
 * conversations, whose session id lives in the backend's acp_session table).
 *
 * Resume is project-scoped for claude/gemini, so the command must run from the
 * original workspace dir (the in-app terminal already opens there).
 */

import type { CliSource } from './types';

export const CLI_RESUME_BUILDERS: Record<CliSource, (sessionId: string) => string> = {
  'claude-code': (id) => `claude --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  gemini: (id) => `gemini --resume ${id}`,
  opencode: (id) => `opencode -s ${id}`,
};

/**
 * Map an ACP agent backend (acp_session.agent_backend / extra.backend) to a CLI
 * source. Returns null for backends without a terminal CLI resume command.
 */
export function backendToCliSource(backend: string | null | undefined): CliSource | null {
  switch (backend) {
    case 'claude':
    case 'claude-code':
      return 'claude-code';
    case 'codex':
      return 'codex';
    case 'gemini':
      return 'gemini';
    case 'opencode':
      return 'opencode';
    default:
      return null;
  }
}

/** Build the resume command from a source + session id, or null when unbuildable. */
export function buildResumeCommand(
  source: CliSource | null | undefined,
  sessionId: string | null | undefined
): string | null {
  if (!source || !sessionId) return null;
  const build = CLI_RESUME_BUILDERS[source];
  return build ? build(sessionId) : null;
}

/**
 * Whether a resolved resume command may enable the "Restore session" terminal menu item.
 * Empty strings and null/undefined are unavailable (including native resolve still pending).
 */
export function isRestoreEnabled(resumeCommand: string | null | undefined): resumeCommand is string {
  return typeof resumeCommand === 'string' && resumeCommand.length > 0;
}
