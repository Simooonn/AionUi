import type { BadgeProps } from '@arco-design/web-react';
import { Badge, Button, Image, Message, Spin, Tooltip } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { Checklist, Download, Right } from '@icon-park/react';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { ImagePreviewContext } from '../MessageList';
import './MessageToolGroupSummary.css';

// Marker embedded in the placeholder response aioncore returns when a file is
// not found (mirrors FilePreview's usage).
const IMAGE_NOT_FOUND_MARKER = 'kltYWdlIG5vdCBmb3VuZD';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

// ---------------------------------------------------------------------------
// GeneratedImage: loads a local image via base64 IPC, uses Arco Image (with
// zoom/preview), falls back silently if the file is missing or unreadable.
// ---------------------------------------------------------------------------
const GeneratedImage: React.FC<{ path: string }> = ({ path }) => {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [messageApi, messageContext] = Message.useMessage();
  const { inPreviewGroup } = useContext(ImagePreviewContext);

  useEffect(() => {
    ipcBridge.fs.getImageBase64
      .invoke({ path })
      .then((data) => {
        if (!data || data.includes(IMAGE_NOT_FOUND_MARKER)) return;
        setSrc(data);
      })
      .catch(() => {
        // File may have been deleted; render nothing silently.
      });
  }, [path]);

  if (!src) return null;

  const alt = getAcpImageFileName(path);
  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success(t('acp.image.download_success'));
    } catch {
      messageApi.error(t('acp.image.download_error'));
    }
  };

  const imageEl = (
    <Image
      src={src}
      alt={alt}
      width={197}
      style={{ maxHeight: 320, objectFit: 'contain', borderRadius: 8, cursor: 'pointer' }}
    />
  );

  return (
    <>
      {messageContext}
      <div className='group relative m-l-20px m-t-8px overflow-hidden rounded border bg-1 p-2 max-w-280px'>
        {inPreviewGroup ? imageEl : <Image.PreviewGroup>{imageEl}</Image.PreviewGroup>}
        <Tooltip content={t('acp.image.download')}>
          <Button
            aria-label={t('acp.image.download_aria')}
            className='!absolute end-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
            type='secondary'
            size='mini'
            shape='circle'
            icon={<Download theme='outline' size='14' />}
            onClick={() => void handleDownload()}
          />
        </Tooltip>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Fallback IPC lookup: for completed imageGeneration tool_call rows that have
// no imagePath (persisted before this fix), ask the main process to find the
// file on disk by call_id.  Only fires once per item; result is display-only.
// ---------------------------------------------------------------------------
type FindCodexImageApi = { findCodexImage?: (callId: string) => Promise<string | null> };

function useFallbackImagePath(item: NormalizedToolCall): string | null {
  const [path, setPath] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    if (item.imagePath) return; // already have a path
    if (item.status !== 'completed') return;
    if (item.name !== 'imageGeneration') return;

    tried.current = true;
    const api = (window as unknown as { electronAPI?: FindCodexImageApi }).electronAPI;
    if (!api?.findCodexImage) return; // WebUI mode: no IPC available

    api
      .findCodexImage(item.key)
      .then((found) => {
        if (found) setPath(found);
      })
      .catch(() => {
        // Not found or IPC unavailable — render nothing.
      });
  }, [item]);

  return path;
}

// ---------------------------------------------------------------------------
// ToolItemDetail: tool name row + expandable input/output panel.
// Images are NO LONGER rendered here — they appear below the whole tool group
// summary panel (outside the showMore toggle) via MessageToolGroupSummary.
// ---------------------------------------------------------------------------
const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  // imagePath is deliberately excluded from hasDetail so the expand arrow does
  // not appear for items whose only "detail" is an image (which now shows outside).
  const hasDetail = displayItem.input || displayItem.output || item.truncated;

  const loadFullItem = async () => {
    if (!item.truncated || fullItem || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFullItem();
  };

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={statusToBadge(item.status)} className={item.status === 'running' ? 'badge-breathing' : ''} />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? toggleExpanded : undefined}
        >
          <span className='font-medium text-13px'>{displayItem.name}</span>
          {displayItem.description && displayItem.description !== displayItem.name && (
            <span className='m-l-4px opacity-80 text-13px'>{displayItem.description}</span>
          )}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={toggleExpanded}>
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {loadingFull && <div className='tool-detail-label'>Loading...</div>}
          {loadError && <div className='tool-detail-label'>Failed to load full output</div>}
          {displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ToolImageRow: wraps a single NormalizedToolCall's image display. It tries
// item.imagePath first (persisted from aioncore) and falls back to the IPC
// lookup for rows that predate the fix.
// ---------------------------------------------------------------------------
const ToolImageRow: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const fallback = useFallbackImagePath(item);
  const path = item.imagePath ?? fallback;
  if (!path) return null;
  return <GeneratedImage path={path} />;
};

// ---------------------------------------------------------------------------
// MessageToolGroupSummary
// ---------------------------------------------------------------------------
const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const hasRunning = hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  // Collect tool items that may have images (either from imagePath or fallback
  // IPC lookup). We render them once outside the collapsed panel so they are
  // always visible regardless of whether View Steps is expanded.
  const imageItems = useMemo(
    () =>
      tools.filter(
        (item) =>
          item.imagePath ||
          // Include completed imageGeneration items without a persisted image so
          // ToolImageRow can attempt the fallback IPC lookup.
          (item.status === 'completed' && item.name === 'imageGeneration')
      ),
    [tools]
  );

  return (
    <div className='tool-group-summary'>
      <div className='tool-group-summary__header' onClick={() => setShowMore(!showMore)}>
        <span className='tool-group-summary__icon'>
          {hasRunning ? <Spin size={12} /> : <Checklist theme='outline' size='14' />}
        </span>
        <span className='tool-group-summary__label'>View Steps {tools.length > 0 ? `· ${tools.length}` : ''}</span>
        <span className={`tool-group-summary__arrow${showMore ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </div>
      {showMore && (
        <div className='tool-group-summary__body'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
      {/* Images are displayed OUTSIDE the fold so they are always visible. */}
      {imageItems.map((item) => (
        <ToolImageRow key={`img-${item.key}`} item={item} />
      ))}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
