import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { useAddEventListener } from '@/renderer/utils/emitter';

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
