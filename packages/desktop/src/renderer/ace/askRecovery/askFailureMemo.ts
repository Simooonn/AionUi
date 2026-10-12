/**
 * Failure state retained while a history-derived question card is unmounted.
 *
 * Submitting such a card routes the answer through the SendBox pipeline, which
 * marks the conversation as processing; the derived card unmounts for that
 * window and is re-derived afterwards. Without this memo a failed send came
 * back as a pristine card: no error row, and Retry / Send-as-message had no
 * payload to re-run.
 */
import type { SubmitAskAnswerInput } from './submitAskAnswer';

export type AskFailureAttempt = {
  input: SubmitAskAnswerInput;
  outcome: 'answered' | 'declined';
};

export type RememberedAskFailure = {
  message: string;
  attempt: AskFailureAttempt;
};

const askFailures = new Map<string, RememberedAskFailure>();

/** Remember the latest failure (and the payload it failed with) for a request. */
export function rememberAskFailure(request_id: string, message: string, attempt: AskFailureAttempt): void {
  askFailures.set(request_id, { message, attempt });
}

/** Consume a remembered failure once when its card mounts again. */
export function takeAskFailure(request_id: string): RememberedAskFailure | null {
  const remembered = askFailures.get(request_id) ?? null;
  askFailures.delete(request_id);
  return remembered;
}

/** Clear a failure when a new submission starts or succeeds. */
export function clearAskFailure(request_id: string): void {
  askFailures.delete(request_id);
}

/** Test-only reset. */
export function resetAskFailureMemo(): void {
  askFailures.clear();
}
