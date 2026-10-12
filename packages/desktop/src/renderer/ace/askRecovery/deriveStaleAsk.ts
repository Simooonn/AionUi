/**
 * Derives question cards from history for a process that is gone.
 * This is a display heuristic only; submission always re-checks the backend.
 */
import type { IAskQuestion, IMessageAsk, IMessageToolCall, TMessage } from '@/common/chat/chatLib';

export type DeriveStaleAskOptions = {
  hydrated: boolean;
  isProcessing: boolean;
  hideSendBox: boolean;
  conversationType: 'acp' | 'codex' | 'aionrs' | undefined;
  lastAnsweredAt: number | null;
  now: number;
};

export const STALE_ASK_ANSWER_WINDOW_MS = 5000;

/** Returns the latest unanswered historical question when the runtime is idle. */
export function deriveStaleAsk(list: TMessage[], opts: DeriveStaleAskOptions): IMessageAsk | null {
  if (!opts.hydrated || opts.isProcessing || opts.hideSendBox || opts.conversationType !== 'acp') return null;

  let q: IMessageToolCall | undefined;
  let questionIndex = -1;
  for (let index = list.length - 1; index >= 0; index--) {
    const message = list[index];
    if (
      message.type === 'tool_call' &&
      message.content?.name === 'AskUserQuestion' &&
      message.status === 'work' &&
      message.content?.status === 'running' &&
      Array.isArray(message.content?.args?.questions) &&
      message.content.args.questions.length > 0
    ) {
      q = message;
      questionIndex = index;
      break;
    }
  }
  if (!q) return null;

  if (opts.lastAnsweredAt != null && opts.now - opts.lastAnsweredAt < STALE_ASK_ANSWER_WINDOW_MS) return null;

  for (let index = questionIndex + 1; index < list.length; index++) {
    const message = list[index];
    if (
      message.hidden === true ||
      message.type === 'thinking' ||
      message.type === 'tips' ||
      message.type === 'available_commands' ||
      message.type === 'plan'
    )
      continue;
    if (message.position === 'right') return null;
  }

  if (list.some((message) => message.type === 'ask' && (message.created_at ?? 0) >= (q.created_at ?? 0))) return null;

  const call_id = q.content.call_id;
  if (
    list.some((message) => {
      if (message.type !== 'acp_tool_call' || (message.status !== 'finish' && message.status !== 'error')) return false;
      const update = message.content?.update;
      const camelCaseId: unknown = update && 'toolCallId' in update ? update.toolCallId : undefined;
      return message.msg_id === q.msg_id || update?.tool_call_id === call_id || camelCaseId === call_id;
    })
  )
    return null;

  const questions: unknown = q.content.args.questions;
  if (
    !Array.isArray(questions) ||
    !questions.every(
      (question: unknown): question is IAskQuestion =>
        typeof question === 'object' &&
        question !== null &&
        'question' in question &&
        typeof question.question === 'string' &&
        'options' in question &&
        Array.isArray(question.options)
    )
  )
    return null;

  return {
    id: `stale-ask:${call_id}`,
    msg_id: `stale-ask:${call_id}`,
    type: 'ask',
    position: 'left',
    conversation_id: q.conversation_id,
    created_at: q.created_at,
    content: { session_id: q.conversation_id, request_id: call_id, questions, source: 'history' },
  };
}
