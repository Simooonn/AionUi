/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/** A configured app's real icon, or `fallback` (the upstream icon-park icon) until it loads. */
const OpenWithAppIcon: React.FC<{ src?: string; fallback?: React.ReactNode }> = ({ src, fallback = null }) =>
  src ? <img src={src} alt='' draggable={false} className='w-16px h-16px' /> : <>{fallback}</>;

export default OpenWithAppIcon;
