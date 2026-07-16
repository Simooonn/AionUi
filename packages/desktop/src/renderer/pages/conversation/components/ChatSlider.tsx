/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { buildCliResumeCommand, useNativeResumeCommand } from '@/renderer/ace/readonly';
import { Message } from '@arco-design/web-react';
import React from 'react';
import ChatWorkspace from '../Workspace';

const ChatSlider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  // Resume command for terminal "+" → Restore session (must be top-level hooks).
  // Same merge formula as ConversationRow: imported sync first, then native ACP IPC.
  const importedResumeCommand = buildCliResumeCommand(conversation);
  const nativeResumeCommand = useNativeResumeCommand(
    conversation?.id ?? '',
    conversation?.type === 'acp' && !importedResumeCommand
  );
  const resumeCommand = importedResumeCommand ?? nativeResumeCommand;

  const workspace = conversation?.extra?.workspace;
  const isTemporaryWorkspace = (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)
    ?.is_temporary_workspace;

  let workspaceNode: React.ReactNode = null;
  if (conversation && workspace) {
    if (conversation.type === 'acp') {
      workspaceNode = (
        <ChatWorkspace
          conversation_id={conversation.id}
          workspace={workspace}
          isTemporaryWorkspace={isTemporaryWorkspace}
          eventPrefix='acp'
          messageApi={messageApi}
          resumeCommand={resumeCommand}
        />
      );
    } else if (conversation.type === 'codex') {
      workspaceNode = (
        <ChatWorkspace
          conversation_id={conversation.id}
          workspace={workspace}
          isTemporaryWorkspace={isTemporaryWorkspace}
          eventPrefix='codex'
          messageApi={messageApi}
          resumeCommand={resumeCommand}
        />
      );
    } else if (conversation.type === 'aionrs') {
      workspaceNode = (
        <ChatWorkspace
          conversation_id={conversation.id}
          workspace={workspace}
          isTemporaryWorkspace={isTemporaryWorkspace}
          eventPrefix='aionrs'
          messageApi={messageApi}
          resumeCommand={resumeCommand}
        />
      );
    }
  }

  if (!workspaceNode) {
    return <div></div>;
  }

  return (
    <>
      {messageContext}
      {workspaceNode}
    </>
  );
};

export default ChatSlider;
