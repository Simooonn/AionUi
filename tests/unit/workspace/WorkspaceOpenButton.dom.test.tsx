/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * WorkspaceOpenButton with configurable "Open with" apps (fork, ace/):
 *  - configured editor / terminal / browser show the app name + real icon and
 *    launch through window.electronAPI.openWithLaunch instead of the upstream path
 *  - fallbacks: missing app → upstream path; no `code` CLI → nothing;
 *    timeout → no second launch; IPC error → upstream path
 *  - no stored choice → no ace IPC at all; non-mac / WebUI / temp workspace unchanged
 *
 * The store is module-level state, so every test re-imports the component and
 * the store after vi.resetModules(). The platform module is mocked because the
 * jsdom user agent follows the host (`Mozilla/5.0 (${process.platform})`).
 */

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenWithInstalledApp, OpenWithLaunchResult } from '@/common/ace/openWithApps';

const h = vi.hoisted(() => ({
  desktop: true,
  mac: true,
  openBrowserTab: vi.fn(),
  checkToolInstalled: vi.fn(async () => true),
  openFolderWith: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key }),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      checkToolInstalled: { invoke: h.checkToolInstalled },
      openFolderWith: { invoke: h.openFolderWith },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => h.desktop,
  isMacOS: () => h.mac,
}));
vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  useOptionalPreviewContext: () => ({ openBrowserTab: h.openBrowserTab }),
}));

const ICON = (id: string) => `data:image/png;base64,${id}`;
const APPS: Record<string, OpenWithInstalledApp> = {
  cursor: { id: 'cursor', category: 'editor', name: 'Cursor' },
  zed: { id: 'zed', category: 'editor', name: 'Zed' },
  iterm2: { id: 'iterm2', category: 'terminal', name: 'iTerm2' },
  terminal: { id: 'terminal', category: 'terminal', name: 'Terminal' },
  chrome: { id: 'chrome', category: 'browser', name: 'Chrome' },
};

type Api = {
  openWithListApps: ReturnType<typeof vi.fn<() => Promise<OpenWithInstalledApp[]>>>;
  openWithAppIcon: ReturnType<typeof vi.fn<(id: string) => Promise<string | null>>>;
  openWithLaunch: ReturnType<
    typeof vi.fn<(req: { appId: string; folderPath?: string }) => Promise<OpenWithLaunchResult>>
  >;
};

let api: Api;
let WorkspaceOpenButton: typeof import('@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton').default;
let store: typeof import('@/renderer/ace/settings/useOpenWithApps');

const installApi = (installed: OpenWithInstalledApp[]) => {
  api = {
    openWithListApps: vi.fn(async () => installed),
    openWithAppIcon: vi.fn(async (id: string) => ICON(id)),
    openWithLaunch: vi.fn(async () => ({ ok: true }) as OpenWithLaunchResult),
  };
  Object.assign(window.electronAPI as object, api);
};

const select = (value: Record<string, string>) => localStorage.setItem('workspace-open-apps', JSON.stringify(value));
const mainButton = (root: HTMLElement = document.body) =>
  root.querySelector('.workspace-open-button__btn') as HTMLElement;
const openDropdown = async (root: HTMLElement = document.body) => {
  fireEvent.click(root.querySelector('.workspace-open-button__dropdown-btn') as HTMLElement);
  return waitFor(() => {
    const items = document.querySelectorAll('.workspace-open-dropdown-item');
    expect(items.length).toBeGreaterThan(0);
    return Array.from(items) as HTMLElement[];
  });
};
/** Open the dropdown and wait until the item labelled `text` is rendered. */
const openAndFind = async (text: string) => {
  await openDropdown();
  return waitFor(() =>
    itemByText(Array.from(document.querySelectorAll('.workspace-open-dropdown-item')) as HTMLElement[], text)
  );
};
const itemByText = (items: HTMLElement[], text: string) => {
  const item = items.find((el) => el.textContent?.includes(text));
  if (!item) throw new Error(`no dropdown item "${text}" in [${items.map((el) => el.textContent).join(', ')}]`);
  return item;
};

const renderButton = (props: Partial<{ workspacePath: string; isTemporary: boolean }> = {}) =>
  render(<WorkspaceOpenButton workspacePath={props.workspacePath ?? '/ws'} isTemporary={props.isTemporary ?? false} />);

beforeEach(async () => {
  h.desktop = true;
  h.mac = true;
  h.openBrowserTab.mockReset();
  h.checkToolInstalled.mockReset().mockResolvedValue(true);
  h.openFolderWith.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  installApi([APPS.cursor, APPS.iterm2, APPS.terminal, APPS.chrome]);
  vi.resetModules();
  ({ default: WorkspaceOpenButton } =
    await import('@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton'));
  store = await import('@/renderer/ace/settings/useOpenWithApps');
});

afterEach(() => {
  cleanup();
  const target = window.electronAPI as unknown as Record<string, unknown>;
  delete target.openWithListApps;
  delete target.openWithAppIcon;
  delete target.openWithLaunch;
});

describe('WorkspaceOpenButton — configured apps', () => {
  it('shows the configured editor with its icon and launches it instead of the upstream path', async () => {
    select({ editor: 'cursor' });
    renderButton();
    const items = await openDropdown();
    const cursor = await waitFor(() => {
      const item = itemByText(Array.from(document.querySelectorAll('.workspace-open-dropdown-item')), 'Cursor');
      expect(item.querySelector('img')?.getAttribute('src')).toBe(ICON('cursor'));
      return item;
    });
    expect(items.some((el) => el.textContent?.includes('VS Code'))).toBe(false);

    fireEvent.click(cursor);
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledWith({ appId: 'cursor', folderPath: '/ws' }));
    expect(h.openFolderWith).not.toHaveBeenCalled();
    expect(localStorage.getItem('workspace-open-preference')).toBe('vscode');
  });

  it('launches the configured terminal from the dropdown and again from the main button', async () => {
    select({ terminal: 'iterm2' });
    renderButton();
    fireEvent.click(await openAndFind('iTerm2'));
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledWith({ appId: 'iterm2', folderPath: '/ws' }));

    // Preference memory: the main button repeats the terminal and shows the real icon.
    await waitFor(() => expect(mainButton().querySelector('img')?.getAttribute('src')).toBe(ICON('iterm2')));
    fireEvent.click(mainButton());
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledTimes(2));
    expect(h.openFolderWith).not.toHaveBeenCalled();
  });

  it('opens the configured external browser instead of the in-app tab', async () => {
    select({ browser: 'chrome' });
    renderButton();
    fireEvent.click(await openAndFind('Chrome'));
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledWith({ appId: 'chrome', folderPath: '/ws' }));
    expect(h.openBrowserTab).not.toHaveBeenCalled();
  });

  it('keeps the in-app browser when no browser is configured', async () => {
    select({ editor: 'cursor' });
    renderButton();
    fireEvent.click(await openAndFind('Browser'));
    await waitFor(() => expect(h.openBrowserTab).toHaveBeenCalledTimes(1));
    expect(api.openWithLaunch).not.toHaveBeenCalled();
  });

  it('launches the stored app even before the installed list arrives', async () => {
    api.openWithListApps.mockReturnValue(new Promise(() => {}));
    localStorage.setItem('workspace-open-preference', 'terminal');
    select({ terminal: 'iterm2' });
    renderButton();
    await waitFor(() => expect(api.openWithListApps).toHaveBeenCalled());
    fireEvent.click(mainButton());
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledWith({ appId: 'iterm2', folderPath: '/ws' }));
    expect(h.openFolderWith).not.toHaveBeenCalled();
  });
});

describe('WorkspaceOpenButton — fallbacks', () => {
  it('falls back to the upstream path when the configured app is missing', async () => {
    api.openWithLaunch.mockResolvedValue({ ok: false, reason: 'not-installed' });
    localStorage.setItem('workspace-open-preference', 'terminal');
    select({ terminal: 'ghostty' });
    renderButton();
    // Not installed → the item keeps its upstream label.
    const items = await openDropdown();
    expect(items.some((el) => el.textContent?.includes('Terminal'))).toBe(true);
    fireEvent.click(mainButton());
    await waitFor(() => expect(h.openFolderWith).toHaveBeenCalledWith({ folder_path: '/ws', tool: 'terminal' }));
  });

  it('does nothing (and re-detects) when the editor vanished and there is no code CLI', async () => {
    installApi([APPS.zed]);
    api.openWithLaunch.mockResolvedValue({ ok: false, reason: 'not-installed' });
    h.checkToolInstalled.mockResolvedValue(false);
    select({ editor: 'zed' });
    renderButton();
    fireEvent.click(await openAndFind('Zed'));
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.checkToolInstalled).toHaveBeenCalledTimes(2));
    expect(h.openFolderWith).not.toHaveBeenCalled();
    expect(api.openWithListApps.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not launch a second time after a timeout', async () => {
    api.openWithLaunch.mockResolvedValue({ ok: false, reason: 'launch-timeout' });
    select({ editor: 'cursor' });
    renderButton();
    fireEvent.click(await openAndFind('Cursor'));
    await waitFor(() => expect(api.openWithLaunch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(h.openFolderWith).not.toHaveBeenCalled();
  });

  it('falls back to the upstream path when the IPC call throws', async () => {
    api.openWithLaunch.mockRejectedValue(new Error('ipc gone'));
    select({ editor: 'cursor' });
    renderButton();
    fireEvent.click(await openAndFind('Cursor'));
    await waitFor(() => expect(h.openFolderWith).toHaveBeenCalledWith({ folder_path: '/ws', tool: 'vscode' }));
  });
});

describe('WorkspaceOpenButton — unchanged paths', () => {
  it('sends no ace IPC when nothing is configured', async () => {
    renderButton();
    const items = await openDropdown();
    fireEvent.click(itemByText(items, 'Terminal'));
    await waitFor(() => expect(h.openFolderWith).toHaveBeenCalledWith({ folder_path: '/ws', tool: 'terminal' }));
    expect(api.openWithListApps).not.toHaveBeenCalled();
    expect(api.openWithLaunch).not.toHaveBeenCalled();
  });

  it('updates every mounted instance when the selection changes', async () => {
    localStorage.setItem('workspace-open-preference', 'terminal');
    const first = renderButton();
    const second = renderButton({ workspacePath: '/other' });
    act(() => store.setOpenWithSelection('terminal', 'iterm2'));
    await waitFor(() => {
      expect(mainButton(first.container).querySelector('img')?.getAttribute('src')).toBe(ICON('iterm2'));
      expect(mainButton(second.container).querySelector('img')?.getAttribute('src')).toBe(ICON('iterm2'));
    });
    act(() => store.setOpenWithSelection('terminal', undefined));
    await waitFor(() => expect(mainButton(first.container).querySelector('img')).toBeNull());
    expect(localStorage.getItem('workspace-open-apps')).toBeNull();
  });

  it('picks up a same-window localStorage write on the next render', async () => {
    renderButton();
    select({ editor: 'cursor' });
    // Opening the dropdown re-renders; the snapshot re-reads storage and the label follows.
    await openDropdown();
    await waitFor(() =>
      expect(itemByText(Array.from(document.querySelectorAll('.workspace-open-dropdown-item')), 'Cursor')).toBeTruthy()
    );
  });

  it('shows only the browser in a temporary workspace, even with an editor configured', async () => {
    select({ editor: 'cursor', terminal: 'iterm2' });
    renderButton({ isTemporary: true });
    const items = await openDropdown();
    await act(async () => {});
    const labels = Array.from(document.querySelectorAll('.workspace-open-dropdown-item')).map((el) => el.textContent);
    expect(labels).toEqual([expect.stringContaining('Browser')]);
    expect(items).toHaveLength(1);
  });

  it('keeps the upstream behaviour off macOS', async () => {
    h.mac = false;
    select({ terminal: 'iterm2' });
    renderButton();
    fireEvent.click(await openAndFind('Terminal'));
    await waitFor(() => expect(h.openFolderWith).toHaveBeenCalledWith({ folder_path: '/ws', tool: 'terminal' }));
    expect(api.openWithListApps).not.toHaveBeenCalled();
    expect(api.openWithLaunch).not.toHaveBeenCalled();
  });

  it('renders nothing in WebUI', () => {
    h.desktop = false;
    const { container } = renderButton();
    expect(container.querySelector('.workspace-open-button')).toBeNull();
  });
});
