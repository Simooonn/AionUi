/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { parseError, uuid } from '@/common/utils';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@renderer/pages/conversation/platforms/useConversationCommandQueue';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { Message } from '@arco-design/web-react';
import HOC from '@renderer/utils/ui/HOC';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { buildSendFailureError } from './buildSendFailureError';
import { useAcpMessage } from './useAcpMessage';
// ace:start CLI-imported conversation resume wiring
import { ensureCliResumeBeforeSend } from '@/renderer/ace/ensureCliMessagesImported';
// ace:end
import TerminalChatOverlay from './terminalChatView/TerminalChatOverlay';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  current_model_id?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
}> = ({
  conversation_id,
  workspace,
  backend,
  session_mode,
  agent_name,
  current_model_id,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
  teamSendMessage,
  teamRuntime,
  assistantId,
}) => {
  useMessageLstCache(conversation_id);
  usePendingConfirmationsRecovery(conversation_id);
  const teamPermission = useTeamPermission();
  const messageState = useAcpMessage(conversation_id, { skipWarmup: Boolean(teamPermission) });
  const { setAiProcessing, resetState } = messageState;
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const runtimeView = useConversationRuntimeView(conversation_id);

  const commandQueueRuntimeGate = teamRuntime?.runtimeGate ?? {
    hydrated: runtimeView.hydrated,
    canSendMessage: runtimeView.canSendMessage,
    isProcessing: runtimeView.isProcessing,
  };
  const isCancelling = runtimeView.state === 'cancelling';
  const isBusy = isCancelling || commandQueueRuntimeGate.isProcessing || !commandQueueRuntimeGate.canSendMessage;

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const displayMessage = buildDisplayMessage(input, files, workspace || '');

      try {
        if (teamPermission) await teamPermission.warmupSession();
        // ace:start re-wire CLI resume right before the send (covers queued commands too)
        await ensureCliResumeBeforeSend(conversation_id);
        // ace:end
        void checkAndUpdateTitle(conversation_id, input);
        if (teamSendMessage) {
          await teamSendMessage({ input: displayMessage, files });
          emitter.emit('chat.history.refresh');
          if (files.length > 0) {
            emitter.emit('acp.workspace.refresh');
          }
          return;
        }

        runtimeView.markSendStarted();
        setAiProcessing(true);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files,
        });
        runtimeView.markSendAccepted(result.turn_id, result.runtime, result.msg_id);
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        runtimeView.markSendFailed(errorMsg);

        if (isBackendHttpError(error) && error.code === 'CONVERSATION_ARCHIVED') {
          Message.error({
            content: error.backendMessage || errorMsg,
            duration: 6000,
          });
          setAiProcessing(false);
          throw error;
        }

        const isAuthError =
          errorMsg.includes('[ACP-AUTH-') ||
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('认证失败');
        if (isAuthError) {
          const errorMessage = {
            id: uuid(),
            msg_id: uuid(),
            turn_id: '',
            conversation_id,
            type: 'error',
            data: t('acp.auth.failed', {
              backend,
              error: errorMsg,
              defaultValue: `${backend} authentication failed:

{{error}}

Please check your local CLI tool authentication status`,
            }),
          };

          ipcBridge.acpConversation.responseStream.emit(errorMessage);
        } else {
          addOrUpdateMessageRef.current(
            {
              id: uuid(),
              msg_id: uuid(),
              type: 'tips',
              position: 'center',
              conversation_id,
              created_at: Date.now(),
              content: {
                content: errorMsg,
                type: 'error',
                error: buildSendFailureError(error, errorMsg),
              },
            },
            true
          );
        }

        resetState();
        setAiProcessing(false);
        throw error;
      }

      if (files.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [
      backend,
      checkAndUpdateTitle,
      conversation_id,
      resetState,
      runtimeView,
      setAiProcessing,
      t,
      teamPermission,
      teamSendMessage,
      workspace,
      addOrUpdateMessageRef,
    ]
  );

  const {
    items: queuedCommands,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    remove,
    clear,
    reorder,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id,
    enabled: true,
    isBusy,
    runtimeGate: commandQueueRuntimeGate,
    teamUpgradeHandoffReady: Boolean(teamRuntime && teamSendMessage),
    onExecute: executeCommand,
  });

  const handleSendCommand = useCallback(
    async (input: string, files: string[]) => {
      if (
        shouldEnqueueConversationCommand({
          enabled: true,
          isBusy,
          hasPendingCommands,
        })
      ) {
        enqueue({ input, files });
        return;
      }
      await executeCommand({ input, files });
    },
    [isBusy, hasPendingCommands, enqueue, executeCommand]
  );

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        workspace,
        type: 'acp',
        cron_job_id,
        hideSendBox,
        loadedSkills,
        loadedMcpServers,
        loadedMcpStatuses,
        assistantId,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className='relative flex-1 flex flex-col px-20px min-h-0'>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          <TerminalChatOverlay handleSendCommand={handleSendCommand} />
          {!hideSendBox && (
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              session_mode={session_mode}
              agent_name={agent_name}
              workspacePath={workspace}
              current_model_id={current_model_id}
              messageState={messageState}
              teamSendMessage={teamSendMessage}
              teamRuntime={teamRuntime}
              queuedCommands={queuedCommands}
              isQueueInteractionLocked={isQueueInteractionLocked}
              hasPendingCommands={hasPendingCommands}
              enqueue={enqueue}
              remove={remove}
              clear={clear}
              reorder={reorder}
              lockInteraction={lockInteraction}
              unlockInteraction={unlockInteraction}
              resetActiveExecution={resetActiveExecution}
              handleSendCommand={handleSendCommand}
              isBusy={isBusy}
            />
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider)(AcpChat);
