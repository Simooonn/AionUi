/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// HUD statusline poller for one ACP conversation. Runs the user's configured
// statusLine command against a per-conversation synthesized stdin payload
// (see process/ace/hudStatusline.ts) every 30s and returns its ANSI output
// with the ctx element removed — the context-usage popover that shows this
// text already carries the context ring. Lives at the sendbox level, not in
// the popover, because Arco unmounts popover content while it is closed and
// the entry point must know whether there is HUD text before the first hover.
import type { HudStatuslineParams, HudStatuslineResult } from '@/common/ace/types';
import type { AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useEffect, useMemo, useState } from 'react';
import { stripHudCtxSegment } from './ansiText';

const REFRESH_MS = 30_000;

type AceApi = { hudStatusline?: (params: HudStatuslineParams) => Promise<HudStatuslineResult> };

const getAceApi = (): AceApi | undefined => (window as unknown as { electronAPI?: AceApi }).electronAPI;

/**
 * The persisted `extra.current_model_id` is null until the user switches
 * models, so the live model comes from the shared config-options snapshot.
 * The id/label are only the HUD's DISPLAY name — the context window size comes
 * from `context_limit`, never from the model name.
 */
const liveModelFromOption = (model: AcpDerivedOption | null): { id: string; label?: string } | null => {
  const id = model?.currentValue;
  if (!id) return null;
  const choice = model.options.find((item) => item.value === id);
  return { id, label: choice?.label };
};

export type UseHudStatuslineOptions = {
  conversation_id: string;
  workspace?: string;
  /** Live model option from the sendbox's config-options snapshot. */
  model: AcpDerivedOption | null;
  /** Conversation's persisted model id, used until the live model is known. */
  current_model_id?: string;
  /** Window size aioncore reported for this session; 0 until it is known. */
  context_limit?: number;
  /** False on mobile: the HUD is never polled there. */
  enabled: boolean;
};

/**
 * Returns the conversation's statusline text without its ctx element, or null
 * when there is none (no ace API, no workspace, IPC null/failure, or nothing
 * printable after stripping). Text fetched for one conversation is never
 * returned for another.
 */
export function useHudStatusline({
  conversation_id,
  workspace,
  model,
  current_model_id,
  context_limit,
  enabled,
}: UseHudStatuslineOptions): string | null {
  const [snapshot, setSnapshot] = useState<{ conversationId: string; text: string } | null>(null);
  const liveModel = useMemo(() => liveModelFromOption(model), [model]);
  const modelId = liveModel?.id ?? current_model_id;
  const modelLabel = liveModel?.label;
  const contextLimit = context_limit && context_limit > 0 ? context_limit : undefined;

  useEffect(() => {
    const api = getAceApi();
    if (!enabled || !workspace || !api?.hudStatusline) return;
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
        if (disposed) return;
        const text = result?.text ? stripHudCtxSegment(result.text) : '';
        setSnapshot(text ? { conversationId: conversation_id, text } : null);
      } catch {
        if (!disposed) setSnapshot(null);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [enabled, workspace, conversation_id, modelId, modelLabel, contextLimit]);

  if (!enabled || !workspace || snapshot?.conversationId !== conversation_id) return null;
  return snapshot.text;
}
