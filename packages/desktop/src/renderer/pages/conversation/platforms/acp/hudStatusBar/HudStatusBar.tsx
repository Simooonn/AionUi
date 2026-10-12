/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// HUD statusline strip for the normal ACP chat view, rendered under the
// SendBox at the very bottom of the conversation column (mirrors where the
// native Claude Code CLI shows its statusline). Runs the user's configured
// statusLine command against a per-conversation synthesized stdin payload
// (see process/ace/hudStatusline.ts) and renders the ANSI output. Hidden
// entirely (returns null) whenever that IPC yields no text — no toggle, no
// state; what the line may omit is decided in the main process.
import type { HudStatuslineParams, HudStatuslineResult } from '@/common/ace/types';
import { type AcpDerivedOption, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import React, { useEffect, useMemo, useState } from 'react';
import { parseAnsiLine } from './ansiText';
import styles from './HudStatusBar.module.css';

const REFRESH_MS = 30_000;

type AceApi = { hudStatusline?: (params: HudStatuslineParams) => Promise<HudStatuslineResult> };

const getAceApi = (): AceApi | undefined => (window as unknown as { electronAPI?: AceApi }).electronAPI;

/**
 * The persisted `extra.current_model_id` is null until the user switches
 * models, so the live model comes from the shared config-options snapshot.
 * The id/label are only the HUD's DISPLAY name — the context window size comes
 * from the `context_limit` prop, never from the model name.
 */
const liveModelFromOption = (model: AcpDerivedOption | null): { id: string; label?: string } | null => {
  const id = model?.currentValue;
  if (!id) return null;
  const choice = model.options.find((item) => item.value === id);
  return { id, label: choice?.label };
};

const HudStatusBar: React.FC<{
  conversation_id: string;
  workspace?: string;
  current_model_id?: string;
  /** Window size aioncore reported for this session; 0 until it is known. */
  context_limit?: number;
}> = ({ conversation_id, workspace, current_model_id, context_limit }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const [text, setText] = useState<string | null>(null);
  // Shares the SWR snapshot with the sendbox pills, so model switches made
  // there reach the statusline without an extra request.
  const { model } = useAcpConfigOptions({ conversation_id, enabled: !isMobile && Boolean(workspace) });
  const liveModel = useMemo(() => liveModelFromOption(model), [model]);
  const modelId = liveModel?.id ?? current_model_id;
  const modelLabel = liveModel?.label;
  const contextLimit = context_limit && context_limit > 0 ? context_limit : undefined;

  useEffect(() => {
    const api = getAceApi();
    if (isMobile || !workspace || !api?.hudStatusline) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await api.hudStatusline!({
          workspace,
          conversationId: conversation_id,
          modelId,
          modelLabel,
          contextLimit,
        });
        if (!disposed) setText(result?.text ?? null);
      } catch {
        if (!disposed) setText(null);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [isMobile, workspace, conversation_id, modelId, modelLabel, contextLimit]);

  if (isMobile || !text) return null;

  return (
    <div className={styles.statusBar} data-testid='chat-hud-statusline'>
      {text.split('\n').map((line, lineIdx) => (
        <div key={lineIdx} className={styles.line}>
          {parseAnsiLine(line).map((seg, segIdx) => (
            <span
              key={segIdx}
              className={
                seg.classes
                  .map((c) => styles[c])
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              {seg.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

export default HudStatusBar;
