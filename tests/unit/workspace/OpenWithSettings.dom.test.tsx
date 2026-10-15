/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings → System "Open With" section (fork, ace/):
 *  - hidden off macOS / outside the desktop app
 *  - each select offers only installed presets of its category (browser adds builtin)
 *  - the list renders first, real icons fill in afterwards
 *  - choosing writes the JSON selection, clearing removes the key
 *  - a stored-but-missing app shows the default placeholder
 *  - storage events from other windows update the selects
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenWithInstalledApp } from '@/common/ace/openWithApps';

const h = vi.hoisted(() => ({ desktop: true, mac: true }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/common', () => ({
  ipcBridge: { shell: { checkToolInstalled: { invoke: vi.fn(async () => true) } } },
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => h.desktop,
  isMacOS: () => h.mac,
}));

const ICON = (id: string) => `data:image/png;base64,${id}`;
const INSTALLED: OpenWithInstalledApp[] = [
  { id: 'cursor', category: 'editor', name: 'Cursor' },
  { id: 'goland', category: 'editor', name: 'GoLand' },
  { id: 'terminal', category: 'terminal', name: 'Terminal' },
  { id: 'iterm2', category: 'terminal', name: 'iTerm2' },
  { id: 'chrome', category: 'browser', name: 'Chrome' },
  { id: 'safari', category: 'browser', name: 'Safari' },
];

let releaseIcons: () => void = () => {};
let api: {
  openWithListApps: ReturnType<typeof vi.fn>;
  openWithAppIcon: ReturnType<typeof vi.fn>;
  openWithLaunch: ReturnType<typeof vi.fn>;
};
let OpenWithSettings: typeof import('@/renderer/ace/settings/OpenWithSettings').default;

const KEY = 'workspace-open-apps';
const selectEl = (category: string) => screen.getByTestId(`open-with-select-${category}`);
const openSelect = async (category: string) => {
  fireEvent.click(selectEl(category).querySelector('.arco-select-view') as HTMLElement);
  return waitFor(() => {
    const options = Array.from(
      document.querySelectorAll('.arco-select-popup:not([style*="display: none"]) .arco-select-option')
    );
    expect(options.length).toBeGreaterThan(0);
    return options as HTMLElement[];
  });
};

beforeEach(async () => {
  h.desktop = true;
  h.mac = true;
  localStorage.clear();
  const iconGate = new Promise<void>((resolve) => {
    releaseIcons = resolve;
  });
  api = {
    openWithListApps: vi.fn(async () => INSTALLED),
    openWithAppIcon: vi.fn(async (id: string) => {
      await iconGate;
      return ICON(id);
    }),
    openWithLaunch: vi.fn(),
  };
  Object.assign(window.electronAPI as object, api);
  vi.resetModules();
  ({ default: OpenWithSettings } = await import('@/renderer/ace/settings/OpenWithSettings'));
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  const target = window.electronAPI as unknown as Record<string, unknown>;
  delete target.openWithListApps;
  delete target.openWithAppIcon;
  delete target.openWithLaunch;
});

describe('OpenWithSettings', () => {
  it('renders nothing off macOS and nothing in WebUI', () => {
    h.mac = false;
    const { container, unmount } = render(<OpenWithSettings />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    h.mac = true;
    h.desktop = false;
    expect(render(<OpenWithSettings />).container).toBeEmptyDOMElement();
  });

  it('refreshes on mount and lists only installed apps of each category', async () => {
    render(<OpenWithSettings />);
    expect(screen.getByText('settings.openWith.title')).toBeInTheDocument();
    await waitFor(() => expect(api.openWithListApps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(selectEl('editor')).not.toHaveClass('arco-select-disabled'));

    expect((await openSelect('editor')).map((el) => el.textContent)).toEqual(['Cursor', 'GoLand']);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();
    document.body.innerHTML = '';

    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('browser')).not.toHaveClass('arco-select-disabled'));
    expect((await openSelect('browser')).map((el) => el.textContent)).toEqual([
      'settings.openWith.builtinBrowser',
      'Chrome',
      'Safari',
    ]);
  });

  it('shows the list before the icons, then fills the icons in', async () => {
    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('terminal')).not.toHaveClass('arco-select-disabled'));
    const before = await openSelect('terminal');
    expect(before.map((el) => el.textContent)).toEqual(['Terminal', 'iTerm2']);
    expect(before.some((el) => el.querySelector('img'))).toBe(false);

    await act(async () => releaseIcons());
    await waitFor(() => {
      const imgs = document.querySelectorAll('.arco-select-option img');
      expect(Array.from(imgs).map((img) => img.getAttribute('src'))).toEqual([ICON('terminal'), ICON('iterm2')]);
    });
  });

  it('writes the selection as JSON and removes the key when cleared', async () => {
    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('terminal')).not.toHaveClass('arco-select-disabled'));
    fireEvent.click((await openSelect('terminal')).find((el) => el.textContent === 'iTerm2') as HTMLElement);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ terminal: 'iterm2' });
    await waitFor(() => expect(selectEl('terminal')).toHaveTextContent('iTerm2'));

    fireEvent.click(selectEl('terminal').querySelector('.arco-select-clear-icon') as HTMLElement);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('maps the built-in browser choice to no stored browser', async () => {
    localStorage.setItem(KEY, JSON.stringify({ browser: 'chrome' }));
    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('browser')).toHaveTextContent('Chrome'));
    fireEvent.click(
      (await openSelect('browser')).find((el) => el.textContent === 'settings.openWith.builtinBrowser') as HTMLElement
    );
    expect(localStorage.getItem(KEY)).toBeNull();
    await waitFor(() => expect(selectEl('browser')).toHaveTextContent('settings.openWith.builtinBrowser'));
  });

  it('shows the default placeholder when the stored app is not installed', async () => {
    localStorage.setItem(KEY, JSON.stringify({ editor: 'zed' }));
    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('editor')).not.toHaveClass('arco-select-disabled'));
    expect(selectEl('editor')).toHaveTextContent('settings.openWith.editorDefault');
    // The stored choice is kept so it comes back if the app is reinstalled.
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ editor: 'zed' });
  });

  it('follows storage events from other windows', async () => {
    render(<OpenWithSettings />);
    await waitFor(() => expect(selectEl('editor')).not.toHaveClass('arco-select-disabled'));
    localStorage.setItem(KEY, JSON.stringify({ editor: 'goland' }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    await waitFor(() => expect(selectEl('editor')).toHaveTextContent('GoLand'));
  });
});
