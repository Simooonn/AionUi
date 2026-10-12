import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAsk } from '@/common/chat/chatLib';
import type { SubmitAskAnswerInput, SubmitAskAnswerResult } from '@/renderer/ace/askRecovery/submitAskAnswer';
import MessageQuestion from '@/renderer/pages/conversation/Messages/MessageQuestion';

const mocks = vi.hoisted(() => ({
  submitAskAnswer: vi.fn(),
  answerAsk: vi.fn(),
  sendMessage: vi.fn(),
  acpSendMessage: vi.fn(),
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('@/renderer/ace/askRecovery/submitAskAnswer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/renderer/ace/askRecovery/submitAskAnswer')>()),
  submitAskAnswer: mocks.submitAskAnswer,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  conversation: {
    answerAsk: { invoke: mocks.answerAsk },
    sendMessage: { invoke: mocks.sendMessage },
  },
  acpConversation: {
    sendMessage: { invoke: mocks.acpSendMessage },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

const QUESTIONS = [{ question: 'Pick one?', options: [{ label: 'A' }, { label: 'B' }] }];

const makeMessage = (source?: 'live' | 'history'): IMessageAsk => ({
  id: 'ask-message-1',
  conversation_id: 'conv-1',
  type: 'ask',
  position: 'left',
  content: { session_id: 'session-1', request_id: 'req-1', questions: QUESTIONS, source },
});

const DECLINE_PAYLOAD: SubmitAskAnswerInput = {
  conversation_id: 'conv-1',
  request_id: 'req-1',
  questions: QUESTIONS,
  decline: true,
  source: undefined,
};

const deferred = () => {
  let resolve!: (value: SubmitAskAnswerResult) => void;
  const promise = new Promise<SubmitAskAnswerResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitAskAnswer.mockResolvedValue({ via: 'ask' });
});

afterEach(() => {
  // The card never sends chat messages itself — resends go through the SendBox pipeline.
  expect(mocks.acpSendMessage).not.toHaveBeenCalled();
  expect(mocks.sendMessage).not.toHaveBeenCalled();
  cleanup();
});

describe('MessageQuestion submit recovery', () => {
  it('submits the selected answer and shows askAnswered when it lands on the ask channel', async () => {
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByTestId('message-question-submit'));

    expect(await screen.findByTestId('message-question-status')).toHaveTextContent('messages.askAnswered');
    expect(mocks.submitAskAnswer).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      request_id: 'req-1',
      questions: QUESTIONS,
      answers: [{ question: 'Pick one?', labels: ['A'] }],
      source: undefined,
    });
  });

  it('shows askResent when the answer went out as a chat message', async () => {
    mocks.submitAskAnswer.mockResolvedValue({ via: 'message' });
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByTestId('message-question-decline'));

    expect(await screen.findByTestId('message-question-status')).toHaveTextContent('messages.askResent');
  });

  it('shows the wrapped failure with retry and resend actions on rejection', async () => {
    mocks.submitAskAnswer.mockRejectedValue(new Error('boom'));
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByTestId('message-question-decline'));

    const error = await screen.findByTestId('message-question-error');
    expect(error).toHaveTextContent('messages.askAnswerFailed:{"reason":"boom"}');
    expect(screen.getByTestId('message-question-retry')).toBeInTheDocument();
    expect(screen.getByTestId('message-question-resend')).toBeInTheDocument();
    expect(screen.queryByTestId('message-question-status')).not.toBeInTheDocument();
  });

  it('does not double-wrap an error that already carries the askAnswerFailed text', async () => {
    const { ASK_ANSWER_FAILED_ERROR } = await import('@/renderer/ace/askRecovery/submitAskAnswer');
    const wrapped = new Error('already wrapped');
    wrapped.name = ASK_ANSWER_FAILED_ERROR;
    mocks.submitAskAnswer.mockRejectedValue(wrapped);
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByTestId('message-question-decline'));

    const error = await screen.findByTestId('message-question-error');
    expect(error).toHaveTextContent('already wrapped');
    expect(error).not.toHaveTextContent('messages.askAnswerFailed');
  });

  it('retry re-runs the same payload', async () => {
    mocks.submitAskAnswer.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ via: 'ask' });
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByTestId('message-question-decline'));
    fireEvent.click(await screen.findByTestId('message-question-retry'));

    expect(await screen.findByTestId('message-question-status')).toHaveTextContent('messages.askDeclined');
    expect(mocks.submitAskAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.submitAskAnswer).toHaveBeenNthCalledWith(1, DECLINE_PAYLOAD);
    expect(mocks.submitAskAnswer).toHaveBeenNthCalledWith(2, DECLINE_PAYLOAD);
  });

  it('send-as-message re-runs the payload with force: message', async () => {
    mocks.submitAskAnswer.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ via: 'message' });
    render(<MessageQuestion message={makeMessage()} />);

    fireEvent.click(screen.getByTestId('message-question-decline'));
    fireEvent.click(await screen.findByTestId('message-question-resend'));

    expect(await screen.findByTestId('message-question-status')).toHaveTextContent('messages.askResent');
    expect(mocks.submitAskAnswer).toHaveBeenNthCalledWith(2, { ...DECLINE_PAYLOAD, force: 'message' });
  });

  it('disables both actions while a submit is pending', async () => {
    const pending = deferred();
    mocks.submitAskAnswer.mockReturnValue(pending.promise);
    render(<MessageQuestion message={makeMessage()} />);
    fireEvent.click(screen.getByText('A'));
    expect(screen.getByTestId('message-question-submit')).toBeEnabled();

    fireEvent.click(screen.getByTestId('message-question-submit'));

    expect(screen.getByTestId('message-question-submit')).toBeDisabled();
    expect(screen.getByTestId('message-question-decline')).toBeDisabled();
    await act(async () => {
      pending.resolve({ via: 'ask' });
      await pending.promise;
    });
    expect(screen.getByTestId('message-question-status')).toHaveTextContent('messages.askAnswered');
  });

  it('renders the stale hint for a history-derived card and passes its source through', async () => {
    render(<MessageQuestion message={makeMessage('history')} />);

    expect(screen.getByTestId('message-question-stale-hint')).toHaveTextContent('messages.askStaleHint');
    fireEvent.click(screen.getByTestId('message-question-decline'));

    await screen.findByTestId('message-question-status');
    expect(mocks.submitAskAnswer).toHaveBeenCalledWith({ ...DECLINE_PAYLOAD, source: 'history' });
  });

  it('omits the stale hint for a live card', () => {
    render(<MessageQuestion message={makeMessage('live')} />);

    expect(screen.queryByTestId('message-question-stale-hint')).not.toBeInTheDocument();
  });
});
