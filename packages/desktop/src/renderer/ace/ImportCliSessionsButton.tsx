/**
 * Settings-page button that imports local Claude Code CLI sessions into the
 * conversation list (idempotent, metadata-only, read-only).
 */

import React from 'react';
import { Button, Message } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import { emitter } from '@/renderer/utils/emitter';
import { useImportCliSessions } from './useImportCliSessions';

const ImportCliSessionsButton: React.FC = () => {
  const { loading, runImport } = useImportCliSessions();

  const handleClick = async () => {
    const res = await runImport();
    const summary = `新增 ${res.imported}，跳过 ${res.skipped}` + (res.failed ? `，失败 ${res.failed}` : '');
    if (res.failed > 0) Message.warning(`导入完成：${summary}`);
    else Message.success(`导入完成：${summary}`);
    // Refresh the sidebar list so newly imported conversations appear immediately.
    emitter.emit('chat.history.refresh');
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
