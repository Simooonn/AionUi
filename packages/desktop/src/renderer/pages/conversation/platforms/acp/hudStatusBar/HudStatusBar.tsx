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
import { type AcpDerivedOption, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import React, { useEffect, useMemo, useState } from 'react';
import { parseAnsiLine } from './ansiText';
import styles from './HudStatusBar.module.css';

const REFRESH_MS = 30_000;

type HudParams = { workspace: string; conversationId?: string; modelId?: string; modelLabel?: string };
type AceApi = { hudStatusline?: (params: HudParams) => Promise<{ text: string } | null> };

const getAceApi = (): AceApi | undefined => (window as unknown as { electronAPI?: AceApi }).electronAPI;

/** "(1M context)" in the option text, or an explicit `[1m]` id marker. */
const ONE_MILLION_HINT = /\[1m\]|1m context/i;

/**
 * The persisted `extra.current_model_id` is null until the user switches
 * models, so the live model comes from the shared config-options snapshot.
 * Its current_value may be an alias ('sonnet') without the `[1m]` marker the
 * statusline sizes ctx% with — recover it from the selected option's
 * label/description before handing the id to hudStatusline.
 */
const liveModelFromOption = (model: AcpDerivedOption | null): { id: string; label?: string } | null => {
  const id = model?.currentValue;
  if (!id) return null;
  const choice = model.options.find((item) => item.value === id);
  const oneMillion = ONE_MILLION_HINT.test(`${id} ${choice?.label ?? ''} ${choice?.description ?? ''}`);
  return {
    id: oneMillion && !id.includes('[1m]') ? `${id}[1m]` : id,
    label: choice?.label,
  };
};

const HudStatusBar: React.FC<{
  conversation_id: string;
  workspace?: string;
  current_model_id?: string;
}> = ({ conversation_id, workspace, current_model_id }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const [text, setText] = useState<string | null>(null);
  // Shares the SWR snapshot with the sendbox pills, so model switches made
  // there reach the statusline without an extra request.
  const { model } = useAcpConfigOptions({ conversation_id, enabled: !isMobile && Boolean(workspace) });
  const liveModel = useMemo(() => liveModelFromOption(model), [model]);
  const modelId = liveModel?.id ?? current_model_id;
  const modelLabel = liveModel?.label;

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
  }, [isMobile, workspace, conversation_id, modelId, modelLabel]);

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
