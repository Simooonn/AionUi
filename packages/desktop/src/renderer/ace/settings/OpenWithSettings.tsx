/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Settings → System section: pick the app the workspace "Open with" dropdown
 * uses for the editor / terminal / browser items (macOS desktop only). Only
 * installed presets are offered; clearing a choice restores the upstream default.
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AionSelect from '@/renderer/components/base/AionSelect';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import {
  OPEN_WITH_BUILTIN_BROWSER_ID,
  type OpenWithCategory,
  type OpenWithInstalledApp,
} from '@/common/ace/openWithApps';
import OpenWithAppIcon from './OpenWithAppIcon';
import { refreshOpenWithApps, setOpenWithSelection, useOpenWithSnapshot } from './useOpenWithApps';

const OpenWithSettings: React.FC = () => {
  const { t } = useTranslation();
  const { enabled, selection, installed, icons } = useOpenWithSnapshot();

  // The settings page always wants the full installed list, even with nothing selected yet.
  useEffect(() => {
    void refreshOpenWithApps();
  }, []);

  if (!enabled) return null;

  const loading = installed === null;
  const appsOf = (category: OpenWithCategory) => (installed ?? []).filter((app) => app.category === category);
  /** The stored choice, only while it is installed; otherwise the select shows the default. */
  const valueOf = (category: OpenWithCategory) => {
    const id = selection[category];
    return id && appsOf(category).some((app) => app.id === id) ? id : undefined;
  };
  const onSelect = (category: OpenWithCategory) => (value: unknown) =>
    setOpenWithSelection(category, typeof value === 'string' ? value : undefined);

  const renderOption = (app: OpenWithInstalledApp) => (
    <AionSelect.Option key={app.id} value={app.id}>
      <span className='flex items-center gap-8px'>
        <OpenWithAppIcon src={icons[app.id]} />
        {app.name}
      </span>
    </AionSelect.Option>
  );

  const appSelect = (category: 'editor' | 'terminal', placeholder: string) => (
    <AionSelect
      className='w-220px'
      data-testid={`open-with-select-${category}`}
      loading={loading}
      disabled={loading}
      allowClear
      placeholder={placeholder}
      value={valueOf(category)}
      onChange={onSelect(category)}
    >
      {appsOf(category).map(renderOption)}
    </AionSelect>
  );

  return (
    <div className='flex flex-col gap-8px py-12px'>
      <div className='text-14px font-medium text-t-primary'>{t('settings.openWith.title')}</div>
      <div className='text-12px text-t-secondary'>{t('settings.openWith.description')}</div>
      <div className='flex flex-col divide-y divide-border-2'>
        <PreferenceRow label={t('settings.openWith.editor')}>
          {appSelect('editor', t('settings.openWith.editorDefault'))}
        </PreferenceRow>
        <PreferenceRow label={t('settings.openWith.terminal')}>
          {appSelect('terminal', t('settings.openWith.terminalDefault'))}
        </PreferenceRow>
        <PreferenceRow label={t('settings.openWith.browser')}>
          <AionSelect
            className='w-220px'
            data-testid='open-with-select-browser'
            loading={loading}
            disabled={loading}
            value={valueOf('browser') ?? OPEN_WITH_BUILTIN_BROWSER_ID}
            onChange={onSelect('browser')}
          >
            <AionSelect.Option value={OPEN_WITH_BUILTIN_BROWSER_ID}>
              {t('settings.openWith.builtinBrowser')}
            </AionSelect.Option>
            {appsOf('browser').map(renderOption)}
          </AionSelect>
        </PreferenceRow>
      </div>
    </div>
  );
};

export default OpenWithSettings;
