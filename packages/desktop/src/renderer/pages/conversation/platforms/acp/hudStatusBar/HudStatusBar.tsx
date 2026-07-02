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
// entirely (returns null) when no data is available — no toggle, no state.
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import React, { useEffect, useState } from 'react';
import { parseAnsiLine } from './ansiText';
import styles from './HudStatusBar.module.css';

const REFRESH_MS = 30_000;

type HudParams = { workspace: string; conversationId?: string; modelId?: string; modelLabel?: string };
type AceApi = { hudStatusline?: (params: HudParams) => Promise<{ text: string } | null> };

const getAceApi = (): AceApi | undefined => (window as unknown as { electronAPI?: AceApi }).electronAPI;

const HudStatusBar: React.FC<{
  conversation_id: string;
  workspace?: string;
  current_model_id?: string;
}> = ({ conversation_id, workspace, current_model_id }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const api = getAceApi();
    if (isMobile || !workspace || !api?.hudStatusline) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await api.hudStatusline!({
          workspace,
          conversationId: conversation_id,
          modelId: current_model_id,
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
  }, [isMobile, workspace, conversation_id, current_model_id]);

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
