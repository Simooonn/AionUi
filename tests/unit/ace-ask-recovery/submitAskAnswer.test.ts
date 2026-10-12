import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAskQuestion, IConfirmation } from '@/common/chat/chatLib';
import { getLastAnsweredAt, resetAnswerClock } from '@/renderer/ace/askRecovery/answerClock';
import {
  ASK_ANSWER_FAILED_ERROR,
  SENDBOX_ACK_TIMEOUT_MS,
  buildResendMessage,
  submitAskAnswer,
  type AskAnswer,
} from '@/renderer/ace/askRecovery/submitAskAnswer';
import { emitter } from '@/renderer/utils/emitter';

const mocks = vi.hoisted(() => ({
  answerAsk: vi.fn(),
  confirmationList: vi.fn(),
  getConversation: vi.fn(),
  ensureRuntime: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  conversation: {
    answerAsk: { invoke: mocks.answerAsk },
    confirmation: { list: { invoke: mocks.confirmationList } },
    get: { invoke: mocks.getConversation },
    ensureRuntime: { invoke: mocks.ensureRuntime },
  },
}));

// Key (+ params JSON) instead of real copy keeps every assertion language-independent.
vi.mock('i18next', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  },
}));

type SendBoxSubmit = {
  conversation_id: string;
  input: string;
  ack: () => void;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const QUESTIONS: IAskQuestion[] = [
  { question: 'Which database?', header: 'DB', options: [{ label: 'Postgres' }, { label: 'SQLite' }] },
  { question: 'Which features?', multi_select: true, options: [{ label: 'Auth' }, { label: 'Cache' }] },
];

const ANSWERS: AskAnswer[] = [
  { question: 'Which database?', labels: ['Postgres'] },
  { question: 'Which features?', labels: ['Auth', 'Cache'] },
];

const BASE = { conversation_id: 'conv-1', request_id: 'req-1', questions: QUESTIONS, answers: ANSWERS };

const NO_AGENT = new Error('No active agent');

const pendingAsk = (call_id: string, questions: IAskQuestion[]): IConfirmation<unknown> => ({
  id: `confirmation-${call_id}`,
  call_id,
  description: '',
  options: [],
  questions,
});

/** Register a SendBox stand-in; `behave` decides how (and whether) it settles. */
const listenSendBox = (behave: (request: SendBoxSubmit) => void): SendBoxSubmit[] => {
  const received: SendBoxSubmit[] = [];
  emitter.on('sendbox.submit', (request) => {
    received.push(request);
    behave(request);
  });
  return received;
};

const ackAndResolve = (request: SendBoxSubmit) => {
  request.ack();
  request.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAnswerClock();
  mocks.answerAsk.mockResolvedValue(undefined);
  mocks.confirmationList.mockResolvedValue([]);
  mocks.getConversation.mockResolvedValue({ id: 'conv-1', runtime: { has_task: false } });
});

afterEach(() => {
  // Recovery must never spawn a process just to probe liveness.
  expect(mocks.ensureRuntime).not.toHaveBeenCalled();
  emitter.removeAllListeners('sendbox.submit');
  vi.useRealTimers();
});

describe('submitAskAnswer — ask channel', () => {
  it('answers a live card on its request id and records the answer time', async () => {
    const received = listenSendBox(ackAndResolve);

    await expect(submitAskAnswer(BASE)).resolves.toEqual({ via: 'ask' });

    expect(mocks.answerAsk).toHaveBeenCalledTimes(1);
    expect(mocks.answerAsk).toHaveBeenCalledWith({ conversation_id: 'conv-1', request_id: 'req-1', answers: ANSWERS });
    expect(getLastAnsweredAt('conv-1')).not.toBeNull();
    expect(mocks.confirmationList).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('sends an explicit decline when no answers are given', async () => {
    await expect(submitAskAnswer({ ...BASE, answers: undefined, decline: true })).resolves.toEqual({ via: 'ask' });

    expect(mocks.answerAsk).toHaveBeenCalledWith({ conversation_id: 'conv-1', request_id: 'req-1', decline: true });
  });

  it('re-answers the pending ask whose question text matches, skipping non-matching items', async () => {
    mocks.answerAsk.mockRejectedValueOnce(NO_AGENT).mockResolvedValueOnce(undefined);
    mocks.confirmationList.mockResolvedValue([
      pendingAsk('call-other', [
        { question: 'Which cache?', options: [] },
        { question: 'Which features?', options: [] },
      ]),
      pendingAsk('call-2', QUESTIONS),
    ]);

    await expect(submitAskAnswer(BASE)).resolves.toEqual({ via: 'ask' });

    expect(mocks.answerAsk).toHaveBeenCalledTimes(2);
    expect(mocks.answerAsk).toHaveBeenLastCalledWith({
      conversation_id: 'conv-1',
      request_id: 'call-2',
      answers: ANSWERS,
    });
    expect(getLastAnsweredAt('conv-1')).not.toBeNull();
    expect(mocks.getConversation).not.toHaveBeenCalled();
  });

  it('does not retry the same request id when the matching pending ask is the one that just failed', async () => {
    mocks.answerAsk.mockRejectedValue(NO_AGENT);
    mocks.confirmationList.mockResolvedValue([pendingAsk('req-1', QUESTIONS)]);
    listenSendBox(ackAndResolve);

    await expect(submitAskAnswer(BASE)).resolves.toEqual({ via: 'message' });

    expect(mocks.answerAsk).toHaveBeenCalledTimes(1);
  });

  it('skips the original request id for a history card and goes straight to the pending list', async () => {
    mocks.confirmationList.mockResolvedValue([pendingAsk('req-1', QUESTIONS)]);

    await expect(submitAskAnswer({ ...BASE, source: 'history' })).resolves.toEqual({ via: 'ask' });

    expect(mocks.answerAsk).toHaveBeenCalledTimes(1);
    expect(mocks.confirmationList.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.answerAsk.mock.invocationCallOrder[0]
    );
    expect(mocks.answerAsk).toHaveBeenCalledWith({ conversation_id: 'conv-1', request_id: 'req-1', answers: ANSWERS });
  });
});

describe('submitAskAnswer — resend as message', () => {
  it('resends through the SendBox when the ask fails and no process is alive', async () => {
    mocks.answerAsk.mockRejectedValue(NO_AGENT);
    const received = listenSendBox(ackAndResolve);

    await expect(submitAskAnswer(BASE)).resolves.toEqual({ via: 'message' });

    expect(mocks.getConversation).toHaveBeenCalledWith({ id: 'conv-1' });
    expect(received).toHaveLength(1);
    expect(received[0].conversation_id).toBe('conv-1');
    expect(received[0].input).toBe(buildResendMessage(QUESTIONS, ANSWERS, false));
    expect(getLastAnsweredAt('conv-1')).not.toBeNull();
  });

  it('surfaces the ask error instead of resending when the process is still alive', async () => {
    mocks.answerAsk.mockRejectedValue(NO_AGENT);
    mocks.getConversation.mockResolvedValue({ id: 'conv-1', runtime: { has_task: true } });
    const received = listenSendBox(ackAndResolve);

    const error = await submitAskAnswer(BASE).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('messages.askAnswerFailed:{"reason":"No active agent"}');
    expect((error as Error).name).toBe(ASK_ANSWER_FAILED_ERROR);
    expect(received).toHaveLength(0);
    expect(getLastAnsweredAt('conv-1')).toBeNull();
  });

  it('resends a history card without probing when no pending ask matches', async () => {
    const received = listenSendBox(ackAndResolve);

    await expect(submitAskAnswer({ ...BASE, source: 'history' })).resolves.toEqual({ via: 'message' });

    expect(mocks.answerAsk).not.toHaveBeenCalled();
    expect(mocks.getConversation).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
  });

  it('force: message skips the ask channel and the liveness probe', async () => {
    const received = listenSendBox(ackAndResolve);

    await expect(submitAskAnswer({ ...BASE, force: 'message' })).resolves.toEqual({ via: 'message' });

    expect(mocks.answerAsk).not.toHaveBeenCalled();
    expect(mocks.confirmationList).not.toHaveBeenCalled();
    expect(mocks.getConversation).not.toHaveBeenCalled();
    expect(received).toHaveLength(1);
  });

  it('rejects with askResendBlocked when no SendBox is listening', async () => {
    await expect(submitAskAnswer({ ...BASE, force: 'message' })).rejects.toThrow('messages.askResendBlocked');

    expect(getLastAnsweredAt('conv-1')).toBeNull();
  });

  it('propagates a SendBox rejection without recording an answer', async () => {
    listenSendBox((request) => {
      request.ack();
      request.reject(new Error('send failed'));
    });

    await expect(submitAskAnswer({ ...BASE, force: 'message' })).rejects.toThrow('send failed');

    expect(getLastAnsweredAt('conv-1')).toBeNull();
  });

  it('rejects with askResendUnconfirmed when the SendBox never acknowledges within the timeout', async () => {
    vi.useFakeTimers();
    listenSendBox(() => undefined);
    let settled = false;
    const pending = submitAskAnswer({ ...BASE, force: 'message' }).finally(() => {
      settled = true;
    });
    const assertion = expect(pending).rejects.toThrow('messages.askResendUnconfirmed');

    await vi.advanceTimersByTimeAsync(SENDBOX_ACK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
    expect(getLastAnsweredAt('conv-1')).toBeNull();
  });

  it('waits without a time limit once the SendBox has acknowledged', async () => {
    vi.useFakeTimers();
    listenSendBox((request) => {
      request.ack();
      setTimeout(request.resolve, 15_000);
    });
    let settled = false;
    const pending = submitAskAnswer({ ...BASE, force: 'message' }).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(SENDBOX_ACK_TIMEOUT_MS + 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).resolves.toEqual({ via: 'message' });
  });
});

describe('buildResendMessage', () => {
  it('formats one line per question in question order, preferring the header and joining labels', () => {
    const reversedAnswers = ANSWERS.toReversed();
    const separator = 'messages.askResendSeparator';

    expect(buildResendMessage(QUESTIONS, reversedAnswers, false)).toBe(
      [
        'messages.askResendHeader',
        'messages.askResendLine:{"question":"DB","answer":"Postgres"}',
        `messages.askResendLine:${JSON.stringify({ question: 'Which features?', answer: `Auth${separator}Cache` })}`,
      ].join('\n')
    );
  });

  it('formats a decline as the header plus a single decline line', () => {
    expect(buildResendMessage(QUESTIONS, undefined, true)).toBe(
      ['messages.askResendHeader', 'messages.askResendDecline'].join('\n')
    );
  });
});
