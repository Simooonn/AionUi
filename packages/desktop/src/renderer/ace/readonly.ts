/**
 * Read-only detection for conversations.
 *
 * CLI-imported conversations (extra.cli_session_id) are NO LONGER read-only:
 * they are continuable via true ACP resume (see process/ace/sessionResume.ts).
 * Only legacy conversation types still render read-only.
 */

import type { CliSource } from '@/common/ace/types';
import type { TChatConversation } from '@/common/config/storage';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';

export function isImportedCliConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  const extra = conversation.extra as { cli_session_id?: string } | undefined;
  return !!extra?.cli_session_id;
}

/**
 * Build the terminal command a user can paste to resume the underlying CLI session
 * (e.g. `claude --resume <id>`). Returns null when the conversation has no captured
 * CLI session id/source. Note: claude/gemini resume is project-scoped, so the command
 * must run from the original workspace dir (which the in-app terminal already opens in).
 */
const CLI_RESUME_BUILDERS: Record<CliSource, (sessionId: string) => string> = {
  'claude-code': (id) => `claude --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  gemini: (id) => `gemini --resume ${id}`,
  opencode: (id) => `opencode -s ${id}`,
};

export function buildCliResumeCommand(conversation?: TChatConversation | null): string | null {
  if (!conversation) return null;
  const extra = conversation.extra as { cli_session_id?: string; cli_source?: CliSource } | undefined;
  const sessionId = extra?.cli_session_id;
  const source = extra?.cli_source;
  if (!sessionId || !source) return null;
  const build = CLI_RESUME_BUILDERS[source];
  return build ? build(sessionId) : null;
}

/** True when the conversation should render read-only (legacy types only). */
export function isReadOnlyConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  return isLegacyReadOnlyConversationType(conversation.type);
}
