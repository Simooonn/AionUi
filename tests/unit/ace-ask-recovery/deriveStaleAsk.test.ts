import type {
  IAskQuestion,
  IMessageAcpToolCall,
  IMessageAsk,
  IMessageText,
  IMessageToolCall,
  TMessage,
} from '@/common/chat/chatLib';
import {
  deriveStaleAsk,
  STALE_ASK_ANSWER_WINDOW_MS,
  type DeriveStaleAskOptions,
} from '@/renderer/ace/askRecovery/deriveStaleAsk';
import { describe, expect, it } from 'vitest';

const questions: IAskQuestion[] = [{ question: 'Which option?', options: [{ label: 'First' }] }];
const opts: DeriveStaleAskOptions = {
  hydrated: true,
  isProcessing: false,
  hideSendBox: false,
  conversationType: 'acp',
  lastAnsweredAt: null,
  now: 10000,
};

function toolCallRow(callId = 'tool-question', overrides: Partial<IMessageToolCall> = {}): IMessageToolCall {
  return {
    id: `row:${callId}`,
    msg_id: callId,
    conversation_id: 'conversation',
    created_at: 1000,
    type: 'tool_call',
    position: 'left',
    status: 'work',
    content: { call_id: callId, name: 'AskUserQuestion', status: 'running', args: { questions } },
    ...overrides,
  };
}

function userRow(id = 'user', overrides: Partial<IMessageText> = {}): IMessageText {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation',
    created_at: 2000,
    type: 'text',
    position: 'right',
    content: { content: 'Continue' },
    ...overrides,
  };
}

function askRow(created_at: number | undefined): IMessageAsk {
  return {
    id: 'live-ask',
    conversation_id: 'conversation',
    type: 'ask',
    position: 'left',
    created_at,
    content: { session_id: 'conversation', request_id: 'request', questions },
  };
}

function acpRow(callId: string, overrides: Partial<IMessageAcpToolCall> = {}): IMessageAcpToolCall {
  return {
    id: `acp:${callId}`,
    msg_id: callId,
    conversation_id: 'conversation',
    type: 'acp_tool_call',
    status: 'finish',
    content: {
      session_id: 'conversation',
      update: {
        sessionUpdate: 'tool_call_update',
        tool_call_id: callId,
        status: 'completed',
        title: 'AskUserQuestion',
        kind: 'execute',
      },
    },
    ...overrides,
  };
}

describe('deriveStaleAsk', () => {
  it('derives a historical card from the last work/running question and preserves its questions', () => {
    const q = toolCallRow();
    const result = deriveStaleAsk([q], opts);
    expect(result).toEqual({
      id: 'stale-ask:tool-question',
      msg_id: 'stale-ask:tool-question',
      type: 'ask',
      position: 'left',
      conversation_id: q.conversation_id,
      created_at: q.created_at,
      content: { session_id: q.conversation_id, request_id: 'tool-question', questions, source: 'history' },
    });
    expect(result?.content.questions).toBe(questions);
  });

  it('does not recover DB conversation 1e57be0e after five later user messages', () => {
    const q = toolCallRow('toolu_01Cg62G887u9uB4hdvvh3UK5', { conversation_id: '1e57be0e' });
    q.content.args.questions = [
      {
        header: '回合中口径',
        multiSelect: false,
        question: '…',
        options: [{ label: '统一分母和定义，回合中底部可领先（推荐）', description: '…' }, { label: '…' }],
      },
    ];
    const later = Array.from({ length: 5 }, (_, index) =>
      userRow(`user-${index}`, { conversation_id: q.conversation_id })
    );
    expect(deriveStaleAsk([q, ...later], opts)).toBeNull();
  });

  it('does not recover DB conversation 4ed3b3ce when a same-msg_id ACP row has finished', () => {
    const callId = 'toolu_01UzQ1nWqVZcuoPMaH1rjq9i';
    const q = toolCallRow(callId, { conversation_id: '4ed3b3ce' });
    const completion = acpRow('different-update-id', { msg_id: callId, conversation_id: q.conversation_id });
    expect(deriveStaleAsk([q, completion], opts)).toBeNull();
  });

  it.each([1000, 1001])('does not duplicate an ask at or after the tool timestamp (%i)', (timestamp) => {
    expect(deriveStaleAsk([askRow(timestamp), toolCallRow()], opts)).toBeNull();
  });

  it('allows an ask older than the tool question', () => {
    expect(deriveStaleAsk([askRow(999), toolCallRow()], opts)?.content.request_id).toBe('tool-question');
  });

  it('treats missing question and ask timestamps as zero', () => {
    expect(
      deriveStaleAsk([toolCallRow('tool-question', { created_at: undefined }), askRow(undefined)], opts)
    ).toBeNull();
  });

  it.each<[string, Partial<DeriveStaleAskOptions>]>([
    ['runtime is not hydrated', { hydrated: false }],
    ['runtime is processing', { isProcessing: true }],
    ['send box is hidden', { hideSendBox: true }],
    ['conversation is codex', { conversationType: 'codex' }],
    ['conversation is aionrs', { conversationType: 'aionrs' }],
    ['conversation type is missing', { conversationType: undefined }],
  ])('does not recover when %s', (_name, override) => {
    expect(deriveStaleAsk([toolCallRow()], { ...opts, ...override })).toBeNull();
  });

  it.each<TMessage>([
    { ...userRow('thinking'), type: 'thinking', content: { content: 'Thinking', status: 'done' } },
    { ...userRow('tips'), type: 'tips', content: { content: 'Notice', type: 'info' } },
    { ...userRow('commands'), type: 'available_commands', content: { commands: [] } },
    { ...userRow('plan'), type: 'plan', content: { session_id: 'conversation', entries: [] } },
    userRow('hidden', { hidden: true }),
  ])('ignores a later $type row with id $id even when positioned right', (row) => {
    expect(deriveStaleAsk([toolCallRow(), row], opts)?.content.request_id).toBe('tool-question');
  });

  it('N1: rejects row-level work when content-level status is completed', () => {
    const q = toolCallRow();
    q.content.status = 'completed';
    expect(deriveStaleAsk([q], opts)).toBeNull();
  });

  it('suppresses recovery 4999 ms after a successful answer', () => {
    expect(deriveStaleAsk([toolCallRow()], { ...opts, lastAnsweredAt: opts.now - 4999 })).toBeNull();
  });

  it('allows recovery exactly 5000 ms after a successful answer', () => {
    expect(STALE_ASK_ANSWER_WINDOW_MS).toBe(5000);
    expect(deriveStaleAsk([toolCallRow()], { ...opts, lastAnsweredAt: opts.now - 5000 })?.content.request_id).toBe(
      'tool-question'
    );
  });

  it('uses the last eligible question despite a user reply after the first question', () => {
    expect(deriveStaleAsk([toolCallRow('first'), userRow(), toolCallRow('second')], opts)?.content.request_id).toBe(
      'second'
    );
  });

  it.each(['finish', 'error'] as const)('rejects a terminal ACP %s matched by snake_case tool id', (status) => {
    expect(deriveStaleAsk([toolCallRow(), acpRow('tool-question', { msg_id: 'other', status })], opts)).toBeNull();
  });

  it('rejects a terminal ACP row matched by camelCase tool id', () => {
    const completion = acpRow('different', { msg_id: 'other' });
    const update = { ...completion.content.update, toolCallId: 'tool-question' };
    completion.content.update = update;
    expect(deriveStaleAsk([toolCallRow(), completion], opts)).toBeNull();
  });

  it('allows a nonterminal ACP row for the same tool', () => {
    expect(deriveStaleAsk([toolCallRow(), acpRow('tool-question', { status: 'work' })], opts)).not.toBeNull();
  });

  it('allows an unrelated terminal ACP row', () => {
    expect(deriveStaleAsk([toolCallRow(), acpRow('other')], opts)).not.toBeNull();
  });

  it('returns null for an empty history', () => {
    expect(deriveStaleAsk([], opts)).toBeNull();
  });

  it.each<{ name: string; value: unknown }>([
    { name: 'missing questions', value: undefined },
    { name: 'empty questions', value: [] },
    { name: 'null question item', value: [null] },
    { name: 'non-string question', value: [{ question: 1, options: [] }] },
    { name: 'missing options', value: [{ question: 'Missing options' }] },
  ])('rejects $name', ({ value }) => {
    const q = toolCallRow();
    q.content.args = { questions: value };
    expect(deriveStaleAsk([q], opts)).toBeNull();
  });
});
