/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// HUD statusline strip for the terminal-style chat view. Replays the user's
// Claude Code statusLine command against the OMC-cached stdin payload of this
// conversation's workspace (see process/ace/hudStatusline.ts) and renders the
// ANSI output. Hidden entirely when the workspace has no OMC HUD cache or no
// statusLine command is configured.
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import React, { useEffect, useState } from 'react';
import { parseAnsiLine } from './ansiText';
import styles from './TerminalHudStatusBar.module.css';

const REFRESH_MS = 30_000;

type HudParams = { workspace: string; conversationId?: string; modelId?: string; modelLabel?: string };
type AceApi = { hudStatusline?: (params: HudParams) => Promise<{ text: string } | null> };

const getAceApi = (): AceApi | undefined => (window as unknown as { electronAPI?: AceApi }).electronAPI;

const TerminalHudStatusBar: React.FC<{ current_model_id?: string }> = ({ current_model_id }) => {
  const conversation = useConversationContextSafe();
  const workspace = conversation?.workspace;
  const conversationId = conversation?.conversation_id;
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const api = getAceApi();
    if (!workspace || !api?.hudStatusline) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const result = await api.hudStatusline!({ workspace, conversationId, modelId: current_model_id });
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
  }, [workspace, conversationId, current_model_id]);

  if (!text) return null;

  return (
    <div className={styles.statusBar} data-testid='terminal-hud-statusline'>
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

export default TerminalHudStatusBar;
