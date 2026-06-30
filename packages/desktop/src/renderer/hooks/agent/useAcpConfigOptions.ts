/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type {
  AcpConfigOptionDto,
  AcpConfigSelectOptionDto,
  AcpModelInfo,
  SetConfigOptionResponse,
} from '@/common/types/platform/acpTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

export type AcpDerivedSelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

export type AcpDerivedOption = {
  id: string;
  category: string;
  currentValue: string | null;
  options: AcpDerivedSelectOption[];
};

export type AcpConfigSetStatus = { state: 'idle' } | { state: 'setting'; optionId: string; requestedValue: string };

export type AcpConfigSetErrorKind =
  | 'command_ack'
  | 'confirmation_timeout'
  | 'config_update_in_progress'
  | 'config_not_observed'
  | 'unknown';

const optionLabel = (option: AcpConfigSelectOptionDto): string => option.name || option.label || option.value;

export function getOptionCurrentValue(option: AcpConfigOptionDto | null | undefined): string | null {
  return option?.current_value ?? null;
}

export function findConfigOption(
  options: AcpConfigOptionDto[] | null | undefined,
  category: string,
  fallbackIds: string[] = []
): AcpConfigOptionDto | null {
  if (!options?.length) return null;
  return (
    options.find((option) => option.category === category) ||
    options.find((option) => fallbackIds.includes(option.id)) ||
    null
  );
}

export function deriveSelectOption(
  options: AcpConfigOptionDto[] | null | undefined,
  category: string,
  fallbackIds: string[] = []
): AcpDerivedOption | null {
  const option = findConfigOption(options, category, fallbackIds);
  if (!option || (option.option_type ?? option.type) !== 'select') return null;
  return {
    id: option.id,
    category,
    currentValue: getOptionCurrentValue(option),
    options: option.options.map((choice) => ({
      value: choice.value,
      label: optionLabel(choice),
      description: choice.description,
    })),
  };
}

export function hasObservedValue(
  response: SetConfigOptionResponse,
  optionId: string,
  requestedValue: string
): response is SetConfigOptionResponse & { config_options: AcpConfigOptionDto[] } {
  if (response.confirmation !== 'observed') return false;
  const option = response.config_options?.find((candidate) => candidate.id === optionId);
  return getOptionCurrentValue(option) === requestedValue;
}

export function classifyConfigSetError(error: unknown): AcpConfigSetErrorKind {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'command_ack';
    if (error.message.includes('config_update_in_progress')) return 'config_update_in_progress';
    if (error.message.includes('config_not_observed')) return 'config_not_observed';
  }
  if (isBackendHttpError(error)) {
    if (error.code === 'confirmation_timeout') return 'confirmation_timeout';
    if (error.code === 'config_update_in_progress') return 'config_update_in_progress';
  }
  return 'unknown';
}

type AcpConfigOptionsKey = readonly ['acp-config-options', string];

const getConfigOptionsKey = (conversation_id: string): AcpConfigOptionsKey =>
  ['acp-config-options', conversation_id] as const;

const statusByConversation = new Map<string, AcpConfigSetStatus>();
const statusListeners = new Map<string, Set<(status: AcpConfigSetStatus) => void>>();

function getConversationSetStatus(conversation_id: string): AcpConfigSetStatus {
  return statusByConversation.get(conversation_id) ?? { state: 'idle' };
}

function setConversationSetStatus(conversation_id: string, status: AcpConfigSetStatus): void {
  statusByConversation.set(conversation_id, status);
  statusListeners.get(conversation_id)?.forEach((listener) => listener(status));
}

function subscribeConversationSetStatus(
  conversation_id: string,
  listener: (status: AcpConfigSetStatus) => void
): () => void {
  const listeners = statusListeners.get(conversation_id) ?? new Set<(status: AcpConfigSetStatus) => void>();
  listeners.add(listener);
  statusListeners.set(conversation_id, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) statusListeners.delete(conversation_id);
  };
}

// ---------------------------------------------------------------------------
// aioncore exposes ACP runtime config as discrete `/model` and `/mode`
// endpoints, not a unified `config-options` list. These adapters synthesize the
// `AcpConfigOptionDto[]` shape the selectors consume so the rest of the hook and
// its consumers stay unchanged. Reasoning effort is encoded into the model id
// (`<model>/<effort>`), so there is no separate thought-level option.
// ---------------------------------------------------------------------------

function modelInfoToOption(info: AcpModelInfo | null | undefined): AcpConfigOptionDto | null {
  if (!info || info.available_models.length === 0) return null;
  return {
    id: 'model',
    category: 'model',
    option_type: 'select',
    current_value: info.current_model_id,
    options: info.available_models.map((model) => ({ value: model.id, label: model.label, name: model.label })),
  };
}

function modeToOption(mode: { mode: string } | null | undefined): AcpConfigOptionDto | null {
  if (!mode) return null;
  // `/mode` reports only the active mode; the available list comes from the
  // agent's cached/static modes (AgentModeSelector), so `options` stays empty.
  return {
    id: 'mode',
    category: 'mode',
    option_type: 'select',
    current_value: mode.mode,
    options: [],
  };
}

function buildConfigOptions(model: AcpModelInfo | null | undefined, mode: { mode: string } | null | undefined): AcpConfigOptionDto[] | null {
  const options = [modelInfoToOption(model), modeToOption(mode)].filter((option): option is AcpConfigOptionDto => option !== null);
  return options.length > 0 ? options : null;
}

/** Resolve to null on the pre-warmup 404 that both GETs return while idle. */
async function fetchOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isBackendHttpError(error) && error.status === 404) return null;
    throw error;
  }
}

const fetchConfigOptions = async ([, conversation_id]: AcpConfigOptionsKey): Promise<AcpConfigOptionDto[] | null> => {
  const [model, mode] = await Promise.all([
    fetchOrNull(ipcBridge.acpConversation.getModelInfo.invoke({ conversation_id })),
    fetchOrNull(ipcBridge.acpConversation.getMode.invoke({ conversation_id })),
  ]);
  return buildConfigOptions(model?.model_info ?? null, mode ?? null);
};

export function useAcpConfigOptions({
  conversation_id,
  prepareRuntime,
  enabled = true,
}: {
  conversation_id: string;
  prepareRuntime?: () => Promise<void>;
  enabled?: boolean;
}) {
  const [setStatus, setSetStatus] = useState<AcpConfigSetStatus>(() => getConversationSetStatus(conversation_id));
  const optionsRef = useRef<AcpConfigOptionDto[] | null>(null);
  const key = useMemo(() => getConfigOptionsKey(conversation_id), [conversation_id]);
  const {
    data: snapshotData,
    mutate,
    isLoading,
  } = useSWR<AcpConfigOptionDto[] | null>(enabled ? key : null, fetchConfigOptions, {
    revalidateOnMount: false,
  });
  const configOptions = enabled ? (snapshotData ?? null) : null;

  useEffect(() => {
    optionsRef.current = configOptions;
  }, [configOptions]);

  useEffect(() => {
    setSetStatus(getConversationSetStatus(conversation_id));
    return subscribeConversationSetStatus(conversation_id, setSetStatus);
  }, [conversation_id]);

  const replaceSnapshot = useCallback(
    (next: AcpConfigOptionDto[]) => {
      optionsRef.current = next;
      void mutate(next, false);
    },
    [mutate]
  );

  const reload = useCallback(async () => {
    await prepareRuntime?.();
    const next = await fetchConfigOptions(key);
    if (next) replaceSnapshot(next);
    return next;
  }, [key, prepareRuntime, replaceSnapshot]);

  const setConfigOption = useCallback(
    async (optionId: string, value: string) => {
      if (getConversationSetStatus(conversation_id).state === 'setting') {
        throw new Error('config_update_in_progress');
      }
      setConversationSetStatus(conversation_id, { state: 'setting', optionId, requestedValue: value });
      try {
        await prepareRuntime?.();
        const previous = optionsRef.current ?? [];
        const preserve = (id: string) => previous.find((option) => option.id === id) ?? null;
        let next: AcpConfigOptionDto[];
        let observed: boolean;
        if (optionId === 'mode') {
          const response = await ipcBridge.acpConversation.setMode.invoke({ conversation_id, mode: value });
          observed = response.mode === value;
          next = [preserve('model'), modeToOption(response)].filter((option): option is AcpConfigOptionDto => option !== null);
        } else {
          // Model + reasoning effort both flow through `/model` (effort is encoded
          // in the `<model>/<effort>` id).
          const response = await ipcBridge.acpConversation.setModel.invoke({ conversation_id, model_id: value });
          observed = response.model_info?.current_model_id === value;
          next = [modelInfoToOption(response.model_info), preserve('mode')].filter((option): option is AcpConfigOptionDto => option !== null);
        }
        if (!observed) {
          throw new Error('config_not_observed');
        }
        replaceSnapshot(next);
        return next;
      } finally {
        setConversationSetStatus(conversation_id, { state: 'idle' });
      }
    },
    [conversation_id, prepareRuntime, replaceSnapshot]
  );

  useEffect(() => {
    if (!enabled) return;
    void reload().catch(() => {});
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_config_option' && message.data) {
        const optionPayload = message.data as { config_options?: AcpConfigOptionDto[] } | AcpConfigOptionDto[];
        const next = Array.isArray(optionPayload) ? optionPayload : optionPayload.config_options;
        if (Array.isArray(next)) replaceSnapshot(next);
      }
      if (message.type === 'agent_status') {
        const statusPayload = message.data as { status?: string } | undefined;
        if (statusPayload?.status === 'session_active') void reload().catch(() => {});
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, enabled, reload, replaceSnapshot]);

  return {
    configOptions,
    isLoading,
    setStatus,
    mode: deriveSelectOption(configOptions, 'mode', ['mode']),
    model: deriveSelectOption(configOptions, 'model', ['model']),
    thoughtLevel: deriveSelectOption(configOptions, 'thought_level', ['thought_level', 'reasoning_effort']),
    reload,
    setConfigOption,
  };
}
