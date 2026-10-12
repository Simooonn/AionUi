import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAskFailure,
  rememberAskFailure,
  resetAskFailureMemo,
  takeAskFailure,
  type AskFailureAttempt,
} from '@/renderer/ace/askRecovery/askFailureMemo';

const attempt = (request_id: string, label = 'A'): AskFailureAttempt => ({
  input: {
    conversation_id: 'conv-1',
    request_id,
    questions: [{ question: 'Pick one?', options: [{ label: 'A' }, { label: 'B' }] }],
    answers: [{ question: 'Pick one?', labels: [label] }],
    source: 'history',
  },
  outcome: 'answered',
});

beforeEach(resetAskFailureMemo);

describe('ask failure memo', () => {
  it('returns null when no failure exists', () => {
    expect(takeAskFailure('missing')).toBeNull();
  });

  it('remembers a failure with its attempt and consumes it only once', () => {
    rememberAskFailure('req-1', 'send failed', attempt('req-1'));
    expect(takeAskFailure('req-1')).toEqual({ message: 'send failed', attempt: attempt('req-1') });
    expect(takeAskFailure('req-1')).toBeNull();
  });

  it('replaces the previous failure for the same request', () => {
    rememberAskFailure('req-1', 'first', attempt('req-1', 'A'));
    rememberAskFailure('req-1', 'latest', attempt('req-1', 'B'));
    const remembered = takeAskFailure('req-1');
    expect(remembered?.message).toBe('latest');
    expect(remembered?.attempt.input.answers?.[0].labels).toEqual(['B']);
  });

  it('clears only the target request and tolerates a missing request', () => {
    rememberAskFailure('req-1', 'first', attempt('req-1'));
    rememberAskFailure('req-2', 'second', attempt('req-2'));
    clearAskFailure('req-1');
    clearAskFailure('missing');
    expect(takeAskFailure('req-1')).toBeNull();
    expect(takeAskFailure('req-2')?.message).toBe('second');
  });

  it('preserves an empty error message', () => {
    rememberAskFailure('req-1', '', attempt('req-1'));
    expect(takeAskFailure('req-1')?.message).toBe('');
  });

  it('resets all remembered failures', () => {
    rememberAskFailure('req-1', 'first', attempt('req-1'));
    rememberAskFailure('req-2', 'second', attempt('req-2'));
    resetAskFailureMemo();
    expect(takeAskFailure('req-1')).toBeNull();
    expect(takeAskFailure('req-2')).toBeNull();
  });
});
