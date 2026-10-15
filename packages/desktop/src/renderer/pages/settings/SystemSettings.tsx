/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
// ace:start ace settings sections (CLI import, Open With)
import ImportCliSessionsButton from '@/renderer/ace/settings/ImportCliSessionsButton';
import OpenWithSettings from '@/renderer/ace/settings/OpenWithSettings';
// ace:end

const SystemSettings: React.FC = () => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : undefined}>
      {isAboutPage ? (
        <AboutModalContent />
      ) : (
        <>
          <SystemModalContent />
          {/* ace:start ace settings sections (CLI import, Open With) */}
          <ImportCliSessionsButton />
          <OpenWithSettings />
          {/* ace:end */}
        </>
      )}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
