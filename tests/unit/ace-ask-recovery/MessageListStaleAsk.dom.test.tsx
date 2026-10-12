import React, { type PropsWithChildren } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IMessageAcpToolCall,
  IMessageAsk,
  IMessageToolCall,
  IMessageToolGroup,
  TMessage,
} from '@/common/chat/chatLib';
import { markAnswered, resetAnswerClock } from '@/renderer/ace/askRecovery/answerClock';
import { STALE_ASK_ANSWER_WINDOW_MS } from '@/renderer/ace/askRecovery/deriveStaleAsk';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useUpdateMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';
import { removePermissionMessage } from '@/renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';

const runtime = vi.hoisted(() => ({ isProcessing: false, hydrated: true }));

vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({ isProcessing: runtime.isProcessing, hydrated: runtime.hydrated }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ key: 'location-key', state: {} }),
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  useConversationArtifacts: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    handleScrollerRef: () => {},
    handleContentRef: () => {},
    handleScroll: () => {},
    handleWheel: () => {},
    handlePointerDown: () => {},
    showScrollButton: false,
    scrollToBottom: () => {},
    scrollElementIntoView: () => {},
    hideScrollButton: () => {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: ({ messages }: { messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> }) => (
    <div data-testid='tool-summary'>{messages.map((message) => message.id).join(',')}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

// The rail reads the whole history over IPC; it is unrelated to the ask card.
vi.mock('@/renderer/pages/conversation/Messages/anchorRail', () => ({
  MessageAnchorRail: () => null,
}));

const CONVERSATION_ID = 'conv-1';
const CALL_ID = 'toolu_X';
const QUESTIONS = [{ question: 'Pick one?', options: [{ label: 'A' }, { label: 'B' }] }];

const askToolCall = (content: Partial<IMessageToolCall['content']> = {}): IMessageToolCall => ({
  id: 'tool-call-row',
  msg_id: CALL_ID,
  conversation_id: CONVERSATION_ID,
  type: 'tool_call',
  position: 'left',
  status: 'work',
  created_at: 100,
  content: { call_id: CALL_ID, name: 'AskUserQuestion', args: { questions: QUESTIONS }, status: 'running', ...content },
});

const finishedAcpToolCall = (): IMessageAcpToolCall => ({
  id: 'acp-tool-call-row',
  msg_id: CALL_ID,
  conversation_id: CONVERSATION_ID,
  type: 'acp_tool_call',
  position: 'left',
  status: 'finish',
  created_at: 101,
  content: {
    session_id: 'session-1',
    update: {
      sessionUpdate: 'tool_call_update',
      tool_call_id: CALL_ID,
      status: 'completed',
      title: 'AskUserQuestion',
      kind: 'execute',
    },
  },
});

const recoveredAsk = (): IMessageAsk => ({
  id: 'confirmation:ask-1',
  msg_id: 'confirmation:ask-1',
  conversation_id: CONVERSATION_ID,
  type: 'ask',
  position: 'left',
  created_at: 200,
  content: { session_id: CONVERSATION_ID, request_id: 'ask-1', questions: QUESTIONS },
});

type StoreHandles = {
  add: ReturnType<typeof useAddOrUpdateMessage>;
  update: ReturnType<typeof useUpdateMessageList>;
  list: TMessage[];
};

const store = {} as StoreHandles;

/** Exposes the real message store hooks to the test body. */
const StoreProbe: React.FC = () => {
  store.add = useAddOrUpdateMessage();
  store.update = useUpdateMessageList();
  store.list = useMessageList();
  return null;
};

const renderList = (initial: TMessage[]) => {
  const Providers = ({ children }: PropsWithChildren) => (
    <ConversationProvider value={{ conversation_id: CONVERSATION_ID, type: 'acp' }}>
      <MessageListLoadingProvider value={false}>
        <MessagePaginationProvider
          value={{ hasMoreBefore: false, hasMoreAfter: false, isLoadingBefore: false, isLoadingAnchor: false }}
        >
          <MessageListProvider value={initial}>{children}</MessageListProvider>
        </MessagePaginationProvider>
      </MessageListLoadingProvider>
    </ConversationProvider>
  );
  const ui = (
    <>
      <StoreProbe />
      <MessageList />
    </>
  );
  const view = render(ui, { wrapper: Providers });
  return { rerender: () => view.rerender(ui) };
};

/** Drains the store's setTimeout-batched merge queue. */
const flushStore = () => {
  act(() => {
    vi.runAllTimers();
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  resetAnswerClock();
  runtime.isProcessing = false;
  runtime.hydrated = true;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MessageList history-derived ask card', () => {
  it('keeps both the tool_call and the finished acp_tool_call rows and shows no card', () => {
    renderList([]);

    act(() => {
      store.add(askToolCall());
    });
    flushStore();
    // Sanity: the running tool_call alone yields a history card.
    expect(screen.getByTestId('message-question-stale-hint')).toBeInTheDocument();

    act(() => {
      store.add(finishedAcpToolCall());
    });
    flushStore();

    expect(store.list).toHaveLength(2);
    expect(store.list.map((message) => message.type)).toEqual(['tool_call', 'acp_tool_call']);
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();
  });

  it('shows no card once a recovered ask is removed and the tool_call completes', () => {
    const { rerender } = renderList([askToolCall(), recoveredAsk()]);

    // The live recovered card renders; the history card is suppressed by it.
    expect(screen.getAllByTestId('message-question')).toHaveLength(1);
    expect(screen.queryByTestId('message-question-stale-hint')).not.toBeInTheDocument();

    // The answer resumes the turn and the backend emits confirmation.remove.
    runtime.isProcessing = true;
    rerender();
    act(() => {
      store.update((list) => removePermissionMessage(list, { id: 'ask-1', call_id: 'ask-1' }));
    });
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();

    // The tool result settles the tool_call row, then the turn ends.
    act(() => {
      store.add(askToolCall({ status: 'completed' }));
    });
    flushStore();
    runtime.isProcessing = false;
    rerender();

    expect(store.list.some((message) => message.type === 'ask')).toBe(false);
    const toolCall = store.list.find((message): message is IMessageToolCall => message.type === 'tool_call');
    expect(toolCall?.content.status).toBe('completed');
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();
  });

  it('shows the stale card after the tool summary while idle and hides it while processing', () => {
    const { rerender } = renderList([askToolCall()]);

    const card = screen.getByTestId('message-question');
    expect(screen.getByTestId('message-question-stale-hint')).toBeInTheDocument();
    const summary = screen.getByTestId('tool-summary');
    expect(summary).toHaveTextContent('tool-call-row');
    expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    runtime.isProcessing = true;
    rerender();
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();
  });

  it('hides the card right after an answer and brings it back once the window passes', () => {
    renderList([askToolCall()]);
    expect(screen.getByTestId('message-question-stale-hint')).toBeInTheDocument();

    act(() => {
      markAnswered(CONVERSATION_ID);
    });
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(STALE_ASK_ANSWER_WINDOW_MS - 100);
    });
    expect(screen.queryByTestId('message-question')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('message-question-stale-hint')).toBeInTheDocument();
  });

  it('ignores answers recorded for another conversation', () => {
    renderList([askToolCall()]);

    act(() => {
      markAnswered('other-conversation');
    });
    expect(screen.getByTestId('message-question-stale-hint')).toBeInTheDocument();
  });
});
