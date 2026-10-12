import { describe, expect, it } from 'vitest';
import type { IMessageToolCall, TMessage } from '@/common/chat/chatLib';
import { hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import { collectAnsweredAskRowIds, settleAnsweredAskRow } from '@/renderer/ace/askRecovery/answeredAskRows';

const askRow = (): IMessageToolCall => ({
  id: 'ask-row',
  msg_id: 'ask-call',
  conversation_id: 'conversation',
  type: 'tool_call',
  position: 'left',
  status: 'work',
  content: { call_id: 'ask-call', name: 'AskUserQuestion', status: 'running', args: {} },
});

const reply = (position: 'left' | 'right' = 'right'): TMessage => ({
  id: 'reply',
  msg_id: 'reply',
  conversation_id: 'conversation',
  type: 'text',
  position,
  content: { content: 'A' },
});

describe('collectAnsweredAskRowIds', () => {
  it('collects a pending ask followed by a right message', () => {
    expect(collectAnsweredAskRowIds([askRow(), reply()])).toEqual(new Set(['ask-call']));
  });

  it('does not collect an ask without a later right message', () => {
    expect(collectAnsweredAskRowIds([reply(), askRow()])).toEqual(new Set());
    expect(collectAnsweredAskRowIds([])).toEqual(new Set());
  });

  it('does not treat later left or thinking messages as answers', () => {
    const thinking: TMessage = { ...reply('left'), type: 'thinking', content: { thought: 'Waiting' } };
    expect(collectAnsweredAskRowIds([askRow(), reply('left'), thinking])).toEqual(new Set());
  });

  it('ignores already completed content', () => {
    const question = askRow();
    question.content.status = 'completed';
    expect(collectAnsweredAskRowIds([question, reply()])).toEqual(new Set());
  });

  it('ignores running tools other than AskUserQuestion', () => {
    const tool = askRow();
    tool.content.name = 'Read';
    expect(collectAnsweredAskRowIds([tool, reply()])).toEqual(new Set());
  });

  it('ignores ask rows whose row status is no longer work', () => {
    const question = askRow();
    question.status = 'finish';
    expect(collectAnsweredAskRowIds([question, reply()])).toEqual(new Set());
  });

  it('counts hidden right messages as answers', () => {
    expect(collectAnsweredAskRowIds([askRow(), { ...reply(), hidden: true }])).toEqual(new Set(['ask-call']));
  });
});

describe('settleAnsweredAskRow', () => {
  it('returns a completed copy without changing the original', () => {
    const original = askRow();
    const snapshot = structuredClone(original);
    const settled = settleAnsweredAskRow(original);
    expect(settled).not.toBe(original);
    expect(settled).toEqual({ ...snapshot, status: 'finish', content: { ...snapshot.content, status: 'completed' } });
    expect(original).toEqual(snapshot);
  });

  it('stops the summary spinner only for the settled copy', () => {
    const original = askRow();
    expect(hasRunningToolMessages([settleAnsweredAskRow(original)])).toBe(false);
    expect(hasRunningToolMessages([original])).toBe(true);
  });
});
