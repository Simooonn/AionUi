/**
 * Read-only detection that also covers CLI-imported conversations.
 *
 * Imported CLI sessions are stored as type='acp' (the only creatable type) but must
 * render read-only with no send box. They are marked by extra.cli_session_id.
 */

import type { TChatConversation } from '@/common/config/storage';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';

export function isImportedCliConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  const extra = conversation.extra as { cli_session_id?: string } | undefined;
  return !!extra?.cli_session_id;
}

/** True when the conversation should render read-only (legacy type OR CLI-imported). */
export function isReadOnlyConversation(conversation?: TChatConversation | null): boolean {
  if (!conversation) return false;
  if (isLegacyReadOnlyConversationType(conversation.type)) return true;
  return isImportedCliConversation(conversation);
}
