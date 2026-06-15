/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Settings block for the Lark group notification. Credentials are saved and
 * read back (masked) through dedicated main-process IPC — never through the
 * renderer's regular config channel, which round-trips through aioncore.
 */

import type { AceLarkNotifyDomain, AceLarkNotifyMaskedConfig, AceLarkNotifySaveConfig } from '@/common/ace/types';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { Button, Input, Message, Select, Switch } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LarkNotifySettingsApi = {
  larkNotifyGetConfig?: () => Promise<AceLarkNotifyMaskedConfig>;
  larkNotifySaveConfig?: (config: AceLarkNotifySaveConfig) => Promise<{ ok: boolean }>;
  larkNotifyTest?: () => Promise<{ ok: boolean; reason?: string }>;
};

const getApi = (): LarkNotifySettingsApi | undefined => (window as { electronAPI?: LarkNotifySettingsApi }).electronAPI;

const SUMMARY_VALUE_SEPARATOR = '::';

const FieldRow: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <div className='flex items-center justify-between gap-24px py-8px'>
    <span className='text-14px text-t-primary shrink-0'>{label}</span>
    <div className='w-320px max-w-full'>{children}</div>
  </div>
);

const LarkNotifySettings: React.FC = () => {
  const { t } = useTranslation();
  const [hasSecret, setHasSecret] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [chatId, setChatId] = useState('');
  const [domain, setDomain] = useState<AceLarkNotifyDomain>('feishu');
  const [summaryValue, setSummaryValue] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Same provider/model enumeration the channel settings use (enabled +
  // capability filtering, Google Auth injection) — NOT the raw static
  // provider.models field, which is frequently empty.
  const { providers, getAvailableModels } = useModelProviderList();

  useEffect(() => {
    void getApi()
      ?.larkNotifyGetConfig?.()
      .then((config) => {
        if (!config) return;
        setEnabled(config.enabled);
        setAppId(config.app_id);
        setChatId(config.chat_id);
        setHasSecret(config.has_secret);
        setDomain(config.domain === 'lark' ? 'lark' : 'feishu');
        if (config.summary_provider?.id && config.summary_provider.use_model) {
          setSummaryValue(
            `${config.summary_provider.id}${SUMMARY_VALUE_SEPARATOR}${config.summary_provider.use_model}`
          );
        }
      })
      .catch((e: unknown): undefined => {
        // Surface load failures in the console so "empty form" is diagnosable
        console.warn('[larkNotify] failed to load config:', e instanceof Error ? e.message : e);
        return undefined;
      });
  }, []);

  const summaryOptions = useMemo(() => {
    return providers.flatMap((provider) =>
      getAvailableModels(provider).map((model) => ({
        label: `${provider.name} / ${model}`,
        value: `${provider.id}${SUMMARY_VALUE_SEPARATOR}${model}`,
      }))
    );
  }, [providers, getAvailableModels]);

  const buildPayload = (): AceLarkNotifySaveConfig => {
    const [id, use_model] = summaryValue?.split(SUMMARY_VALUE_SEPARATOR) ?? [];
    return {
      enabled,
      app_id: appId,
      app_secret: appSecret || undefined,
      chat_id: chatId,
      domain,
      summary_provider: id && use_model ? { id, use_model } : undefined,
    };
  };

  const handleSave = async () => {
    const api = getApi();
    if (!api?.larkNotifySaveConfig) return;
    setSaving(true);
    try {
      const result = await api.larkNotifySaveConfig(buildPayload());
      if (result?.ok) {
        Message.success(t('settings.larkNotify.saveSuccess'));
        if (appSecret) {
          setHasSecret(true);
          setAppSecret('');
        }
      } else {
        Message.error(t('settings.larkNotify.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const api = getApi();
    if (!api?.larkNotifyTest) return;
    setTesting(true);
    try {
      const result = await api.larkNotifyTest();
      if (result?.ok) {
        Message.success(t('settings.larkNotify.testSuccess'));
      } else {
        Message.error(`${t('settings.larkNotify.testFailed')}${result?.reason ? ` (${result.reason})` : ''}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className='mt-24px'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-14px text-2 font-500'>{t('settings.larkNotify.title')}</div>
          <div className='text-12px text-t-tertiary mt-2px'>{t('settings.larkNotify.description')}</div>
        </div>
        <Switch checked={enabled} onChange={setEnabled} />
      </div>
      <div className='mt-8px'>
        <FieldRow label={t('settings.larkNotify.domain')}>
          <Select
            value={domain}
            onChange={(value: AceLarkNotifyDomain) => setDomain(value)}
            options={[
              { label: t('settings.larkNotify.domainFeishu'), value: 'feishu' },
              { label: t('settings.larkNotify.domainLark'), value: 'lark' },
            ]}
          />
        </FieldRow>
        <FieldRow label={t('settings.larkNotify.appId')}>
          <Input value={appId} onChange={setAppId} placeholder='cli_xxx' />
        </FieldRow>
        <FieldRow label={t('settings.larkNotify.appSecret')}>
          <Input.Password
            value={appSecret}
            onChange={setAppSecret}
            placeholder={hasSecret ? t('settings.larkNotify.appSecretSetPlaceholder') : ''}
          />
        </FieldRow>
        <FieldRow label={t('settings.larkNotify.chatId')}>
          <Input value={chatId} onChange={setChatId} placeholder='oc_xxx' />
        </FieldRow>
        <FieldRow label={t('settings.larkNotify.summaryModel')}>
          <Select
            value={summaryValue}
            onChange={(value: string) => setSummaryValue(value)}
            options={summaryOptions}
            placeholder={t('settings.larkNotify.summaryModelPlaceholder')}
            notFoundContent={
              <div className='px-12px py-8px text-12px text-t-tertiary'>
                {t('settings.larkNotify.summaryModelEmpty')}
              </div>
            }
            allowClear
            showSearch
            onClear={() => setSummaryValue(undefined)}
          />
        </FieldRow>
        <div className='flex items-center justify-end gap-8px mt-8px'>
          <Button loading={testing} disabled={!hasSecret && !appSecret} onClick={() => void handleTest()}>
            {t('settings.larkNotify.test')}
          </Button>
          <Button type='primary' loading={saving} onClick={() => void handleSave()}>
            {t('settings.larkNotify.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LarkNotifySettings;
