/**
 * Read-only detection for conversations.
 *
 * CLI-imported conversations (extra.cli_session_id) are NO LONGER read-only:
 * they are continuable via true ACP resume (see process/ace/sessionResume.ts).
 * Only legacy conversation types still render read-only.
 */

import type { TChatConversation } from '@/common/config/storage';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';

export function isImportedCliConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  const extra = conversation.extra as { cli_session_id?: string } | undefined;
  return !!extra?.cli_session_id;
}

/** True when the conversation should render read-only (legacy types only). */
export function isReadOnlyConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  return isLegacyReadOnlyConversationType(conversation.type);
}
