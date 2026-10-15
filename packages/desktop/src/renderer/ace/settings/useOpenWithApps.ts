/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Renderer store for the configurable "Open with" apps (fork, macOS desktop only).
 *
 * localStorage (`workspace-open-apps`) is the single source of truth for the
 * selection: the snapshot re-reads it on every call, so a write from Settings,
 * from another window, or directly in devtools is picked up on the next render.
 * The installed list and app icons come from the main process
 * (`window.electronAPI.openWith*`, see process/ace/aceBridge.ts) and are only
 * used for display — launching looks at the stored selection alone, and the
 * main process reports `not-installed` when the app is gone.
 */

import { useSyncExternalStore } from 'react';
import { ipcBridge } from '@/common';
import {
  OPEN_WITH_BUILTIN_BROWSER_ID,
  OPEN_WITH_STORAGE_KEY,
  OPEN_WITH_TOOL_CATEGORY,
  parseOpenWithSelection,
  selectionToPreset,
  type OpenWithCategory,
  type OpenWithInstalledApp,
  type OpenWithLaunchRequest,
  type OpenWithLaunchResult,
  type OpenWithPreset,
  type OpenWithSelection,
  type OpenWithToolKey,
} from '@/common/ace/openWithApps';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';

type OpenWithApi = {
  openWithListApps?: () => Promise<OpenWithInstalledApp[]>;
  openWithAppIcon?: (appId: string) => Promise<string | null>;
  openWithLaunch?: (request: OpenWithLaunchRequest) => Promise<OpenWithLaunchResult>;
};

const getApi = (): OpenWithApi | undefined => (window as unknown as { electronAPI?: OpenWithApi }).electronAPI;

export type OpenWithSnapshot = {
  enabled: boolean;
  selection: OpenWithSelection;
  /** null until the first list arrives from the main process. */
  installed: OpenWithInstalledApp[] | null;
  /** Real app icons (PNG data URLs) by preset id, filled in as they load. */
  icons: Readonly<Record<string, string>>;
};

const listeners = new Set<() => void>();
let installed: OpenWithInstalledApp[] | null = null;
let icons: Readonly<Record<string, string>> = {};
const iconsLoading = new Set<string>();
let refreshing: Promise<void> | null = null;
let lastRaw: string | null | undefined;
let lastSelection: OpenWithSelection = {};
let snapshot: OpenWithSnapshot | undefined;

/** macOS desktop with the fork's preload — everywhere else the dropdown behaves exactly as upstream. */
export const isOpenWithEnabled = (): boolean =>
  isElectronDesktop() && isMacOS() && typeof getApi()?.openWithListApps === 'function';

const isOpenWithToolKey = (tool: string): tool is OpenWithToolKey => Object.hasOwn(OPEN_WITH_TOOL_CATEGORY, tool);

const readRawSelection = (): string | null => {
  try {
    return localStorage.getItem(OPEN_WITH_STORAGE_KEY);
  } catch {
    return null;
  }
};

const notify = () => {
  for (const listener of listeners) listener();
};

const onStorage = (event: StorageEvent) => {
  // key === null means another window cleared the whole storage.
  if (event.key === null || event.key === OPEN_WITH_STORAGE_KEY) notify();
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
};

/** Current state; returns the same object while nothing changed (useSyncExternalStore contract). */
export function getOpenWithSnapshot(): OpenWithSnapshot {
  const raw = readRawSelection();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastSelection = parseOpenWithSelection(raw);
  }
  const enabled = isOpenWithEnabled();
  if (
    !snapshot ||
    snapshot.enabled !== enabled ||
    snapshot.selection !== lastSelection ||
    snapshot.installed !== installed ||
    snapshot.icons !== icons
  ) {
    snapshot = { enabled, selection: lastSelection, installed, icons };
  }
  return snapshot;
}

export function useOpenWithSnapshot(): OpenWithSnapshot {
  return useSyncExternalStore(subscribe, getOpenWithSnapshot, getOpenWithSnapshot);
}

const sameApps = (a: OpenWithInstalledApp[] | null, b: OpenWithInstalledApp[]): boolean =>
  a !== null &&
  a.length === b.length &&
  a.every((app, i) => app.id === b[i].id && app.category === b[i].category && app.name === b[i].name);

const loadMissingIcons = (apps: OpenWithInstalledApp[]) => {
  const api = getApi();
  for (const app of apps) {
    if (icons[app.id] || iconsLoading.has(app.id)) continue;
    const request = api?.openWithAppIcon?.(app.id);
    if (!request) continue;
    iconsLoading.add(app.id);
    request
      .then((icon) => {
        if (typeof icon === 'string' && icon.startsWith('data:image/')) {
          icons = { ...icons, [app.id]: icon };
          notify();
        }
      })
      // A failed icon is not remembered; the next refresh asks again.
      .catch((): void => undefined)
      .finally(() => iconsLoading.delete(app.id));
  }
};

/**
 * Re-detect installed apps (cheap `stat`s in the main process), then load any
 * missing icons in the background. Concurrent calls share one request.
 */
export function refreshOpenWithApps(): Promise<void> {
  if (!isOpenWithEnabled()) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async (): Promise<void> => {
    try {
      const list = await getApi()?.openWithListApps?.();
      if (Array.isArray(list) && !sameApps(installed, list)) {
        installed = list;
        notify();
      }
    } catch {
      // Keep the previous list; detection is retried on the next refresh.
    }
    loadMissingIcons(installed ?? []);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Store (or clear, with undefined / the built-in browser) the app for a category. */
export function setOpenWithSelection(category: OpenWithCategory, id: string | undefined): void {
  const next: OpenWithSelection = { ...getOpenWithSnapshot().selection };
  if (!id || id === OPEN_WITH_BUILTIN_BROWSER_ID) delete next[category];
  else next[category] = id;
  try {
    if (Object.keys(next).length === 0) localStorage.removeItem(OPEN_WITH_STORAGE_KEY);
    else localStorage.setItem(OPEN_WITH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: nothing to persist, the defaults stay in effect.
  }
  notify();
}

/** The app configured for an upstream tool key (non-reactive; ignores installation on purpose). */
export function getOpenWithAppForTool(tool: string): OpenWithPreset | undefined {
  const { enabled, selection } = getOpenWithSnapshot();
  if (!enabled || !isOpenWithToolKey(tool)) return undefined;
  return selectionToPreset(OPEN_WITH_TOOL_CATEGORY[tool], selection);
}

const requestLaunch = async (request: OpenWithLaunchRequest): Promise<OpenWithLaunchResult> => {
  try {
    return (await getApi()?.openWithLaunch?.(request)) ?? { ok: false, reason: 'launch-failed' };
  } catch {
    return { ok: false, reason: 'launch-failed' };
  }
};

/**
 * Launch the configured app for `tool`. Resolves true when handled (the caller
 * must skip its upstream branch), false to fall back to the upstream behaviour.
 */
export async function launchOpenWithApp(tool: string, folderPath: string): Promise<boolean> {
  const app = getOpenWithAppForTool(tool);
  if (!app) return false;

  const result = await requestLaunch({ appId: app.id, folderPath });
  if (result.ok === true) return true;

  void refreshOpenWithApps();
  // `open` may still bring the app up after the timeout; falling back would launch twice.
  if (result.reason === 'launch-timeout') return true;
  if (tool === 'vscode') {
    // Upstream's editor path needs the `code` CLI; without it the fallback would fail
    // silently. Treat it as handled — the refreshed list hides the item instead.
    const hasCode = await ipcBridge.shell.checkToolInstalled.invoke({ tool: 'vscode' }).catch(() => false);
    return !hasCode;
  }
  return false;
}
