/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { iconColors } from '@/renderer/styles/colors';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import RuntimeSelectorPill from './RuntimeSelectorPill';
import { getCurrentThoughtLevelLabel, isConfigSetting, RuntimeSelectorCheckedItem, renderThoughtLevelMenuGroup } from './runtimeSelectorOptions';

/**
 * Some ACP backends (notably Claude Code) encode the reasoning effort INTO the
 * model id as `"<model>/<effort>"` — e.g. `"opus[1m]/high"` labelled
 * `"Opus (1M context) (high)"`. The runtime exposes them only as one combined
 * `available_models` list, never as a separate `thought_level` config option.
 *
 * To present them as two independent dropdowns (model + effort) we parse the
 * combined entries on the client and recombine on selection.
 */
type CombinedModelOption = {
  id: string;
  modelKey: string;
  effortKey: string;
  modelLabel: string;
  effortLabel: string;
};

/** Returns the parsed combined options, or null when the list is NOT in `<model>/<effort>` form. */
const parseCombinedModels = (models: ReadonlyArray<{ id: string; label: string }>): CombinedModelOption[] | null => {
  if (models.length === 0) return null;
  const out: CombinedModelOption[] = [];
  for (const m of models) {
    const slash = m.id.indexOf('/');
    // Require a real split: at least one char on each side.
    if (slash <= 0 || slash >= m.id.length - 1) return null;
    const lastParen = m.label.lastIndexOf(' (');
    out.push({
      id: m.id,
      modelKey: m.id.slice(0, slash),
      effortKey: m.id.slice(slash + 1),
      modelLabel: lastParen > 0 ? m.label.slice(0, lastParen) : m.label,
      effortLabel: lastParen > 0 ? m.label.slice(lastParen + 2).replace(/\)\s*$/, '') : m.id.slice(slash + 1),
    });
  }
  return out;
};

const uniqueBy = <T,>(items: T[], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

/**
 * Presentational runtime model + thought-level controls for the ACP sendbox
 * toolbar. Hook-free: data + switch callback come from the host
 * ({@link AcpSendBox}).
 *
 * Renders up to two compact pills styled like {@link AgentModeSelector}:
 * - Combined backends (Claude Code): **Model** pill + **Effort** pill, parsed
 *   from the `<model>/<effort>` list. The separate thought-level pill is hidden
 *   because effort already covers it.
 * - Other backends: **Model** pill + (optional) separate **Thought-level** pill.
 *
 * `currentModelId` (the conversation's persisted model) is the source of truth
 * for the active selection so the pills reflect the real conversation model,
 * not the handshake default carried by `model_info`.
 */
const AcpRuntimeModelControls: React.FC<{
  model_info: AcpModelInfo | null;
  /** Conversation's persisted current model id; falls back to model_info. */
  currentModelId?: string | null;
  /** Model-specific "setting in progress" flag from useAcpModelInfo. */
  isSetting: boolean;
  /** Shared config set-status (any option setting) for disable/loading gating. */
  setStatus: AcpConfigSetStatus;
  /** Switch the runtime model. For combined backends the id is `<model>/<effort>`. */
  onSwitchModel: (model_id: string) => void;
  /** Separate thought-level option (non-combined backends). Null otherwise. */
  thoughtLevel: AcpDerivedOption | null;
  /** Persist + toast handled by the host; receives (optionId, value). */
  onSelectThoughtLevel: (optionId: string, value: string) => void;
}> = ({ model_info, currentModelId, isSetting, setStatus, onSwitchModel, thoughtLevel, onSelectThoughtLevel }) => {
  const { t } = useTranslation();
  const isRuntimeSetting = isConfigSetting(setStatus);
  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;
  const trailing = <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />;
  const pillClassName = 'sendbox-model-btn agent-mode-compact-pill';

  const available = model_info?.available_models ?? [];
  const combined = parseCombinedModels(available);
  const resolvedCurrentId = currentModelId || model_info?.current_model_id || null;

  // No model info at all → read-only "Use CLI model" pill (backward compatible).
  if (!model_info || available.length === 0) {
    const label =
      getModelDisplayLabel({
        selected_value: resolvedCurrentId,
        selectedLabel: model_info?.current_model_label ?? '',
        defaultModelLabel: t('common.defaultModel'),
        fallbackLabel: t('conversation.welcome.useCliModel'),
      }) || t('conversation.welcome.useCliModel');
    return (
      <Tooltip content={model_info ? label : t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <RuntimeSelectorPill className={pillClassName} label={label} leading={renderLogo()} style={{ cursor: 'default' }} />
      </Tooltip>
    );
  }

  // ---- Combined backends (Claude Code): Model pill + Effort pill ----
  if (combined) {
    const current = combined.find((c) => c.id === resolvedCurrentId) ?? combined[0];
    const models = uniqueBy(combined, (c) => c.modelKey);
    const efforts = uniqueBy(combined, (c) => c.effortKey);
    const switchTo = (modelKey: string, effortKey: string) => {
      if (isRuntimeSetting) return;
      const nextId = `${modelKey}/${effortKey}`;
      if (nextId !== current.id) onSwitchModel(nextId);
    };

    const modelPill = (
      <Dropdown
        trigger='click'
        droplist={
          <Menu>
            <Menu.ItemGroup title={t('common.model', { defaultValue: 'Model' })}>
              {models.map((m) => (
                <Menu.Item key={m.modelKey} className={m.modelKey === current.modelKey ? 'bg-2!' : ''} onClick={() => switchTo(m.modelKey, current.effortKey)}>
                  <RuntimeSelectorCheckedItem selected={m.modelKey === current.modelKey}>{m.modelLabel}</RuntimeSelectorCheckedItem>
                </Menu.Item>
              ))}
            </Menu.ItemGroup>
          </Menu>
        }
      >
        <RuntimeSelectorPill testId='acp-toolbar-model-selector' className={pillClassName} label={current.modelLabel} leading={renderLogo()} trailing={trailing} loading={isSetting || isRuntimeSetting} disabled={isRuntimeSetting} />
      </Dropdown>
    );

    const effortPill =
      efforts.length > 1 ? (
        <Dropdown
          trigger='click'
          droplist={
            <Menu>
              <Menu.ItemGroup title={t('agent.thoughtLevel.label')}>
                {efforts.map((e) => (
                  <Menu.Item key={e.effortKey} className={e.effortKey === current.effortKey ? 'bg-2!' : ''} onClick={() => switchTo(current.modelKey, e.effortKey)}>
                    <RuntimeSelectorCheckedItem selected={e.effortKey === current.effortKey}>{e.effortLabel}</RuntimeSelectorCheckedItem>
                  </Menu.Item>
                ))}
              </Menu.ItemGroup>
            </Menu>
          }
        >
          <RuntimeSelectorPill testId='acp-toolbar-thought-level-selector' className={pillClassName} label={current.effortLabel} leading={renderLogo()} trailing={trailing} loading={isSetting || isRuntimeSetting} disabled={isRuntimeSetting} />
        </Dropdown>
      ) : null;

    return (
      <>
        {modelPill}
        {effortPill}
      </>
    );
  }

  // ---- Non-combined backends: Model pill + optional separate Thought-level pill ----
  const modelLabel = getModelDisplayLabel({
    selected_value: resolvedCurrentId,
    selectedLabel: (resolvedCurrentId && available.find((m) => m.id === resolvedCurrentId)?.label) || model_info.current_model_label || '',
    defaultModelLabel: t('common.defaultModel'),
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });

  const modelPill = (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          <Menu.ItemGroup title={t('common.model', { defaultValue: 'Model' })}>
            {available.map((model) => (
              <Menu.Item key={model.id} className={model.id === resolvedCurrentId ? 'bg-2!' : ''} onClick={() => !isRuntimeSetting && model.id !== resolvedCurrentId && onSwitchModel(model.id)}>
                <RuntimeSelectorCheckedItem selected={model.id === resolvedCurrentId}>{model.label || model.id}</RuntimeSelectorCheckedItem>
              </Menu.Item>
            ))}
          </Menu.ItemGroup>
        </Menu>
      }
    >
      <RuntimeSelectorPill testId='acp-toolbar-model-selector' className={pillClassName} label={modelLabel} leading={renderLogo()} trailing={trailing} loading={isSetting || isRuntimeSetting} disabled={isRuntimeSetting} />
    </Dropdown>
  );

  const thoughtPill = thoughtLevel ? (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          {renderThoughtLevelMenuGroup({
            thoughtLevel,
            setStatus,
            title: t('agent.thoughtLevel.label'),
            onSelect: (value) => onSelectThoughtLevel(thoughtLevel.id, value),
          })}
        </Menu>
      }
    >
      <RuntimeSelectorPill testId='acp-toolbar-thought-level-selector' className={pillClassName} label={getCurrentThoughtLevelLabel(thoughtLevel)} leading={renderLogo()} trailing={trailing} loading={isRuntimeSetting} disabled={isRuntimeSetting} />
    </Dropdown>
  ) : null;

  return (
    <>
      {modelPill}
      {thoughtPill}
    </>
  );
};

export default AcpRuntimeModelControls;
