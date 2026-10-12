/**
 * The backend keeps unanswered prompts pending across restarts. Once the user
 * moves on, those rows must no longer drive the View Steps spinner. These
 * display-only helpers leave the message store unchanged.
 */
import type { IMessageToolCall, TMessage } from '@/common/chat/chatLib';

/** Collect pending AskUserQuestion call IDs followed by a user-side message. */
export function collectAnsweredAskRowIds(list: TMessage[]): Set<string> {
  const answeredIds = new Set<string>();
  let hasLaterRightMessage = false;
  for (let index = list.length - 1; index >= 0; index--) {
    const message = list[index];
    if (
      hasLaterRightMessage &&
      message.type === 'tool_call' &&
      message.content?.name === 'AskUserQuestion' &&
      message.status === 'work' &&
      message.content?.status === 'running'
    ) {
      answeredIds.add(message.content.call_id);
    }
    if (message.position === 'right') hasLaterRightMessage = true;
  }
  return answeredIds;
}

/** Return a settled display copy without mutating the stored tool call. */
export function settleAnsweredAskRow(message: IMessageToolCall): IMessageToolCall {
  return { ...message, status: 'finish', content: { ...message.content, status: 'completed' } };
}
