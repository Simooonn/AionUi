/**
 * Settings-page button that imports local CLI sessions into the conversation
 * list (idempotent, metadata-only, read-only). A dry-run scan + confirmation
 * dialog guards the actual import: a projects dir polluted by automation once
 * held 42k session files, and one click imported all of them. With 0 new
 * sessions the import still runs (no dialog) so the duplicate cleanup happens.
 */

import React from 'react';
import { Button, Message, Modal } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import {
  buildImportSummary,
  releaseRemovedConversations,
  resolveScanAction,
  useImportCliSessions,
} from './useImportCliSessions';

const ImportCliSessionsButton: React.FC = () => {
  const { t } = useTranslation();
  const { loading, runScan, runImport } = useImportCliSessions();

  const doImport = async () => {
    const res = await runImport();
    // The toast carries counts only; failure reasons go to the devtools console.
    if (res.errors.length > 0) console.warn('[ace:import]', res.errors);
    const summary = buildImportSummary(res, t);
    if (summary.level === 'nothing') Message.info(summary.text);
    else if (summary.level === 'warning') Message.warning(summary.text);
    else Message.success(summary.text);
    // Backend HTTP deletes never reach the main process: release the PTYs and
    // persisted command queues of the duplicates the cleanup removed.
    releaseRemovedConversations(res.removedIds ?? [], {
      emit: (id) => emitter.emit('conversation.deleted', id),
      dispose: (id) => ipcBridge.terminal.disposeByConversation.invoke({ conversationId: id }),
    });
    // Refresh the sidebar list so imported / removed conversations show immediately.
    emitter.emit('chat.history.refresh');
  };

  const handleClick = async () => {
    const scan = await runScan();
    switch (resolveScanAction(scan)) {
      case 'scan-failed':
        Message.error(t('conversation.importCli.scanFailed'));
        return;
      case 'import-direct':
        await doImport();
        return;
      case 'confirm':
        Modal.confirm({
          title: t('conversation.importCli.confirmTitle'),
          content: t('conversation.importCli.confirmContent', { count: scan?.total ?? 0 }),
          onOk: doImport,
        });
        return;
    }
  };

  return (
    <div className='flex flex-col gap-8px py-12px'>
      <div className='text-14px font-medium text-t-primary'>导入 CLI 会话</div>
      <div className='text-12px text-t-secondary'>
        把本地 Claude Code 和 Codex 历史会话导入列表（幂等去重，仅会话元数据，导入后只读）。
      </div>
      <div>
        <Button type='primary' loading={loading} icon={<Download />} onClick={handleClick}>
          导入 CLI 会话
        </Button>
      </div>
    </div>
  );
};

export default ImportCliSessionsButton;
