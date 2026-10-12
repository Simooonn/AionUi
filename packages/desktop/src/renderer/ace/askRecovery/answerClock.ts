/**
 * Per-conversation "last answered" timestamps for AskUserQuestion cards.
 * Lets history-derived cards stay hidden for a few seconds after an answer
 * lands, before the resent message / tool result reaches the message list.
 */

const lastAnsweredAt = new Map<string, number>();
const answeredListeners = new Set<(conversation_id: string) => void>();

/** Record that an ask for `conversation_id` was just answered (used to suppress a history-derived card for a few seconds). */
export function markAnswered(conversation_id: string, at: number = Date.now()): void {
  lastAnsweredAt.set(conversation_id, at);
  answeredListeners.forEach((listener) => listener(conversation_id));
}

/** Subscribe to `markAnswered` calls (the clock is not React state); returns the unsubscribe function. */
export function onAnswered(listener: (conversation_id: string) => void): () => void {
  answeredListeners.add(listener);
  return () => {
    answeredListeners.delete(listener);
  };
}

/** Timestamp of the most recent answer for `conversation_id`, or null when none was recorded. */
export function getLastAnsweredAt(conversation_id: string): number | null {
  return lastAnsweredAt.get(conversation_id) ?? null;
}

/** test-only reset */
export function resetAnswerClock(): void {
  lastAnsweredAt.clear();
}
