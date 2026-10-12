/**
 * Submit strategy for AskUserQuestion cards that survives a dead agent process.
 *
 * The dedicated ask channel 404s ("No active agent") once the claude process is
 * gone, which used to fail silently. Order of attempts:
 *  1. answer the original request id (live cards only);
 *  2. answer a pending ask whose questions match ours by text (the request id
 *     can change when the ask is re-raised);
 *  3. probe liveness read-only (never spawns a process) — a live process means
 *     the answer may have landed, so surface the error instead of resending;
 *  4. resend the answer as a normal chat message through the active SendBox.
 */

import i18next from 'i18next';
import { conversation } from '@/common/adapter/ipcBridge';
import type { IAskQuestion, IConfirmation } from '@/common/chat/chatLib';
import { emitter } from '@/renderer/utils/emitter';
import { markAnswered } from './answerClock';

export type AskAnswer = { question: string; labels: string[] };

export type SubmitAskAnswerInput = {
  conversation_id: string;
  request_id: string;
  questions: IAskQuestion[];
  /** Omitted/undefined => decline. */
  answers?: AskAnswer[];
  decline?: boolean;
  source?: 'live' | 'history';
  /** Skip the ask channel and liveness probe; always resend as a message. */
  force?: 'message';
};

export type SubmitAskAnswerResult = { via: 'ask' | 'message' };

/** How long the SendBox has to acknowledge a programmatic send before it counts as lost. */
export const SENDBOX_ACK_TIMEOUT_MS = 10_000;

/** Error name marking a failure whose message already is the translated `messages.askAnswerFailed` text. */
export const ASK_ANSWER_FAILED_ERROR = 'AskAnswerFailedError';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const sameQuestions = (pending: IAskQuestion[] | undefined, ours: IAskQuestion[]): boolean =>
  Array.isArray(pending) &&
  pending.length > 0 &&
  pending.length === ours.length &&
  pending.every((q, i) => q.question === ours[i].question);

async function answerViaAsk(
  conversation_id: string,
  request_id: string,
  answers: AskAnswer[] | undefined,
  decline: boolean
): Promise<void> {
  await conversation.answerAsk.invoke(
    decline ? { conversation_id, request_id, decline: true } : { conversation_id, request_id, answers: answers ?? [] }
  );
}

async function listPendingConfirmations(conversation_id: string): Promise<IConfirmation<unknown>[]> {
  try {
    const pending = await conversation.confirmation.list.invoke({ conversation_id });
    return Array.isArray(pending) ? pending : [];
  } catch {
    return [];
  }
}

async function hasLiveTask(conversation_id: string): Promise<boolean> {
  try {
    // Read-only GET; ensureRuntime would spawn a process, so it is never used here.
    const conv = await conversation.get.invoke({ id: conversation_id });
    return conv?.runtime?.has_task === true;
  } catch {
    return false;
  }
}

function resendViaSendBox(conversation_id: string, input: string): Promise<void> {
  if (emitter.listenerCount('sendbox.submit') === 0) {
    return Promise.reject(new Error(i18next.t('messages.askResendBlocked')));
  }
  return new Promise<void>((resolve, reject) => {
    // Only receipt is time-boxed; once acked the send may take as long as it needs.
    const timer = setTimeout(() => {
      reject(new Error(i18next.t('messages.askResendUnconfirmed')));
    }, SENDBOX_ACK_TIMEOUT_MS);
    emitter.emit('sendbox.submit', {
      conversation_id,
      input,
      ack: () => {
        clearTimeout(timer);
      },
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    });
  });
}

/** Plain-text answer sent as a chat message when the ask channel is unavailable. */
export function buildResendMessage(
  questions: IAskQuestion[],
  answers: AskAnswer[] | undefined,
  decline: boolean
): string {
  const lines = [i18next.t('messages.askResendHeader')];
  if (decline) {
    lines.push(i18next.t('messages.askResendDecline'));
    return lines.join('\n');
  }
  const separator = i18next.t('messages.askResendSeparator');
  for (const q of questions) {
    const labels = answers?.find((a) => a.question === q.question)?.labels ?? [];
    lines.push(
      i18next.t('messages.askResendLine', { question: q.header || q.question, answer: labels.join(separator) })
    );
  }
  return lines.join('\n');
}

/** Answer an AskUserQuestion card, falling back to a chat message when the agent process is gone. */
export async function submitAskAnswer(input: SubmitAskAnswerInput): Promise<SubmitAskAnswerResult> {
  const { conversation_id, request_id, questions, answers, source, force } = input;
  const decline = input.decline === true || answers === undefined;

  if (force !== 'message') {
    let askError: unknown = null;
    const triedOriginal = source !== 'history';

    if (triedOriginal) {
      try {
        await answerViaAsk(conversation_id, request_id, answers, decline);
        markAnswered(conversation_id);
        return { via: 'ask' };
      } catch (error) {
        askError = error;
      }
    }

    const pending = await listPendingConfirmations(conversation_id);
    const match = pending.find((item) => sameQuestions(item.questions, questions));
    if (match && (match.call_id !== request_id || !triedOriginal)) {
      try {
        await answerViaAsk(conversation_id, match.call_id, answers, decline);
        markAnswered(conversation_id);
        return { via: 'ask' };
      } catch (error) {
        askError = error;
      }
    }

    // A live process after a failed ask attempt means the answer may already have
    // landed (only the response was lost): let the user choose instead of resending.
    if (askError !== null && (await hasLiveTask(conversation_id))) {
      const failure = new Error(i18next.t('messages.askAnswerFailed', { reason: errorMessage(askError) }));
      failure.name = ASK_ANSWER_FAILED_ERROR;
      throw failure;
    }
  }

  await resendViaSendBox(conversation_id, buildResendMessage(questions, answers, decline));
  markAnswered(conversation_id);
  return { via: 'message' };
}
