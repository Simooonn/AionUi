import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { useAddEventListener } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

const mountedSendBoxes = new Map<string, number>();

/** Whether the target conversation has a mounted SendBox. */
export function hasSendBoxFor(conversation_id: string): boolean {
  return (mountedSendBoxes.get(conversation_id) ?? 0) > 0;
}

/** Register one SendBox mount and return its cleanup. */
export function registerSendBox(conversation_id: string): () => void {
  mountedSendBoxes.set(conversation_id, (mountedSendBoxes.get(conversation_id) ?? 0) + 1);
  return () => {
    const remaining = (mountedSendBoxes.get(conversation_id) ?? 0) - 1;
    if (remaining > 0) mountedSendBoxes.set(conversation_id, remaining);
    else mountedSendBoxes.delete(conversation_id);
  };
}

/** Test-only reset. */
export function resetSendBoxRegistry(): void {
  mountedSendBoxes.clear();
}

type SendBoxSubmitListenerOptions = {
  conversation_id: string;
  executeCommand: (command: Pick<ConversationCommandQueueItem, 'input' | 'files' | 'sessions'>) => Promise<void>;
  supportsMidturnDelivery: boolean;
  isBusy: boolean;
  t: (key: 'messages.askResendBlocked') => string;
};

/** Route programmatic sends through the active SendBox with its normal busy gate. */
export function useSendBoxSubmitListener({
  conversation_id,
  executeCommand,
  supportsMidturnDelivery,
  isBusy,
  t,
}: SendBoxSubmitListenerOptions): void {
  useEffect(() => registerSendBox(conversation_id), [conversation_id]);

  useAddEventListener(
    'sendbox.submit',
    ({ conversation_id: target, input, ack, resolve, reject }) => {
      if (target !== conversation_id) return;
      ack();
      if (!supportsMidturnDelivery && isBusy) {
        reject(new Error(t('messages.askResendBlocked')));
        return;
      }
      executeCommand({ input, files: [], sessions: undefined }).then(resolve, reject);
    },
    [conversation_id, executeCommand, supportsMidturnDelivery, isBusy, t]
  );
}
