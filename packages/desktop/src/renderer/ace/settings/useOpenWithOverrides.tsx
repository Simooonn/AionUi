/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single hook point WorkspaceOpenButton uses for configurable "Open with"
 * apps: swaps the label and icon of each tool option for the configured app
 * (only once it is known to be installed) and exposes the main button icon.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { OPEN_WITH_TOOL_CATEGORY, selectionToPreset, type OpenWithPreset } from '@/common/ace/openWithApps';
import OpenWithAppIcon from './OpenWithAppIcon';
import { refreshOpenWithApps, useOpenWithSnapshot } from './useOpenWithApps';

type ToolOptionLike = { key: string; label: string; icon: React.ReactNode; available: boolean };

export function useOpenWithOverrides<T extends ToolOptionLike>(
  toolOptions: T[],
  { isTemporary, dropdownOpen }: { isTemporary: boolean; dropdownOpen: boolean }
): { options: T[]; iconForTool: (tool: string) => React.ReactNode | undefined } {
  const { enabled, selection, installed, icons } = useOpenWithSnapshot();
  // No stored choice → no IPC at all: the dropdown stays byte-for-byte upstream.
  const active = enabled && Object.keys(selection).length > 0;

  useEffect(() => {
    if (active) void refreshOpenWithApps();
  }, [active]);
  useEffect(() => {
    if (active && dropdownOpen) void refreshOpenWithApps();
  }, [active, dropdownOpen]);

  /** The configured app for a tool key, only when it is known to be installed (display only). */
  const shownApp = useCallback(
    (tool: string): OpenWithPreset | undefined => {
      if (!active || !installed || !Object.hasOwn(OPEN_WITH_TOOL_CATEGORY, tool)) return undefined;
      const app = selectionToPreset(OPEN_WITH_TOOL_CATEGORY[tool as keyof typeof OPEN_WITH_TOOL_CATEGORY], selection);
      return app && installed.some((item) => item.id === app.id) ? app : undefined;
    },
    [active, installed, selection]
  );

  const options = useMemo(() => {
    if (!active) return toolOptions;
    return toolOptions.map((option) => {
      const app = shownApp(option.key);
      if (!app) return option;
      return {
        ...option,
        label: app.name,
        icon: <OpenWithAppIcon src={icons[app.id]} fallback={option.icon} />,
        // The upstream VS Code item also requires the `code` CLI; a configured editor doesn't.
        available: option.key === 'vscode' ? !isTemporary : option.available,
      };
    });
  }, [active, toolOptions, shownApp, icons, isTemporary]);

  const iconForTool = useCallback(
    (tool: string) => {
      const app = shownApp(tool);
      return app && icons[app.id] ? <OpenWithAppIcon src={icons[app.id]} /> : undefined;
    },
    [shownApp, icons]
  );

  return { options, iconForTool };
}
