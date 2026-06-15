/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the renderer XtermView component (Step 5 acceptance).
 * Runs in the `dom` (jsdom) Vitest project.
 *
 * Data plane is `window.terminalAPI` (input / onOutput / onExit / attach); control
 * resize rides the typed `ipcBridge.terminal.resize`. xterm + addon-fit and the CSS
 * import are mocked so no canvas/DOM renderer is needed. i18n is mocked to echo keys
 * so the exit-banner strings are asserted to be translated (not hardcoded).
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const X = vi.hoisted(() => {
  const terminals: Array<{
    opts: unknown;
    cols: number;
    rows: number;
    options: { theme?: unknown };
    open: ReturnType<typeof vi.fn>;
    loadAddon: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    dataDisposable: { dispose: ReturnType<typeof vi.fn> };
    onDataCb?: (d: string) => void;
  }> = [];

  class Terminal {
    opts: unknown;
    cols = 80;
    rows = 24;
    options: { theme?: unknown } = {};
    open = vi.fn();
    loadAddon = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    dataDisposable = { dispose: vi.fn() };
    onDataCb?: (d: string) => void;
    constructor(opts: unknown) {
      this.opts = opts;
      terminals.push(this);
    }
    onData(cb: (d: string) => void) {
      this.onDataCb = cb;
      return this.dataDisposable;
    }
  }

  class FitAddon {
    fit = vi.fn();
    proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
  }

  return { terminals, Terminal, FitAddon };
});

vi.mock('@xterm/xterm', () => ({ Terminal: X.Terminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: X.FitAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { code?: number }) => (opts && typeof opts.code === 'number' ? `${key}#${opts.code}` : key),
  }),
}));
vi.mock('@/common', () => ({
  ipcBridge: { terminal: { resize: { invoke: vi.fn(() => Promise.resolve()) } } },
}));

import { ipcBridge } from '@/common';
import XtermView from '@/renderer/pages/conversation/Workspace/terminal/XtermView';

const TID = 'term-1';
const EXITED_KEY = 'conversation.workspace.terminal.exited';
const RESTART_KEY = 'conversation.workspace.terminal.restart';

type TermAPI = {
  input: ReturnType<typeof vi.fn>;
  attach: ReturnType<typeof vi.fn>;
  onOutput: ReturnType<typeof vi.fn>;
  onExit: ReturnType<typeof vi.fn>;
};

let api: TermAPI;
let offOutput: ReturnType<typeof vi.fn>;
let offExit: ReturnType<typeof vi.fn>;
let roCallback: (() => void) | undefined;

beforeEach(() => {
  X.terminals.length = 0;
  offOutput = vi.fn();
  offExit = vi.fn();
  api = {
    input: vi.fn(),
    attach: vi.fn(() => Promise.resolve()),
    onOutput: vi.fn(() => offOutput),
    onExit: vi.fn(() => offExit),
  };
  (window as unknown as { terminalAPI: TermAPI }).terminalAPI = api;

  // Capture the ResizeObserver callback so the debounced refit can be driven.
  roCallback = undefined;
  global.ResizeObserver = class {
    constructor(cb: () => void) {
      roCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  vi.mocked(ipcBridge.terminal.resize.invoke).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Render the component and let the mount effects + attach microtask settle. */
async function mountView(props: { active?: boolean } = {}) {
  const onRestart = vi.fn();
  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<XtermView terminalId={TID} active={props.active ?? true} onRestart={onRestart} />);
    await Promise.resolve();
  });
  return { onRestart, utils: utils! };
}

const lastTerm = () => X.terminals[X.terminals.length - 1];
const outputCb = () => api.onOutput.mock.calls[0][0] as (p: { terminalId: string; data: string }) => void;
const exitCb = () => api.onExit.mock.calls[0][0] as (p: { terminalId: string; exitCode: number }) => void;

describe('XtermView', () => {
  describe('mount', () => {
    it('creates and opens an xterm Terminal when active', async () => {
      await mountView({ active: true });
      expect(X.terminals).toHaveLength(1);
      expect(lastTerm().loadAddon).toHaveBeenCalledTimes(1);
      expect(lastTerm().open).toHaveBeenCalledTimes(1);
    });

    it('calls terminalAPI.attach(terminalId) on mount (reattach: bind sender + replay)', async () => {
      await mountView({ active: true });
      expect(api.attach).toHaveBeenCalledWith(TID);
      expect(api.onOutput).toHaveBeenCalledTimes(1);
      expect(api.onExit).toHaveBeenCalledTimes(1);
    });

    it('does not create a terminal or attach until the tab is active (lazy-create)', async () => {
      await mountView({ active: false });
      expect(X.terminals).toHaveLength(0);
      expect(api.attach).not.toHaveBeenCalled();
    });
  });

  describe('input', () => {
    it('forwards keystrokes to terminalAPI.input(terminalId, data)', async () => {
      await mountView();
      act(() => lastTerm().onDataCb!('echo hi\n'));
      expect(api.input).toHaveBeenCalledWith(TID, 'echo hi\n');
    });
  });

  describe('output', () => {
    it('writes incoming output addressed to this terminal', async () => {
      await mountView();
      act(() => outputCb()({ terminalId: TID, data: 'stdout-bytes' }));
      expect(lastTerm().write).toHaveBeenCalledWith('stdout-bytes');
    });

    it('ignores output addressed to a different terminal', async () => {
      await mountView();
      act(() => outputCb()({ terminalId: 'other', data: 'nope' }));
      expect(lastTerm().write).not.toHaveBeenCalled();
    });
  });

  describe('exit UX', () => {
    it('renders the i18n exit banner with a Restart affordance on a matching exit', async () => {
      const { utils } = await mountView();
      act(() => exitCb()({ terminalId: TID, exitCode: 137 }));

      expect(utils.getByText(`${EXITED_KEY}#137`)).toBeInTheDocument();
      expect(utils.getByText(RESTART_KEY)).toBeInTheDocument();
    });

    it('ignores exit events addressed to a different terminal', async () => {
      const { utils } = await mountView();
      act(() => exitCb()({ terminalId: 'other', exitCode: 1 }));
      expect(utils.queryByText(`${EXITED_KEY}#1`)).not.toBeInTheDocument();
    });

    it('Restart calls onRestart(terminalId) and clears the banner', async () => {
      const { onRestart, utils } = await mountView();
      act(() => exitCb()({ terminalId: TID, exitCode: 0 }));

      act(() => fireEvent.click(utils.getByText(RESTART_KEY)));

      expect(onRestart).toHaveBeenCalledWith(TID);
      expect(utils.queryByText(`${EXITED_KEY}#0`)).not.toBeInTheDocument();
    });
  });

  describe('resize', () => {
    it('resizes via ipcBridge.terminal.resize after the mount fit', async () => {
      await mountView();
      expect(ipcBridge.terminal.resize.invoke).toHaveBeenCalledWith({ terminalId: TID, cols: 80, rows: 24 });
    });

    it('debounces a ResizeObserver change (100ms) before resizing', async () => {
      vi.useFakeTimers();
      const onRestart = vi.fn();
      act(() => {
        render(<XtermView terminalId={TID} active onRestart={onRestart} />);
      });
      await act(async () => {
        await Promise.resolve(); // flush attach microtask
      });
      vi.mocked(ipcBridge.terminal.resize.invoke).mockClear();

      act(() => {
        roCallback?.();
        vi.advanceTimersByTime(100);
      });

      expect(ipcBridge.terminal.resize.invoke).toHaveBeenCalledWith({ terminalId: TID, cols: 80, rows: 24 });
    });
  });

  describe('cleanup', () => {
    it('disposes the terminal and unsubscribes output/exit on unmount', async () => {
      const { utils } = await mountView();
      const term = lastTerm();
      act(() => utils.unmount());

      expect(term.dataDisposable.dispose).toHaveBeenCalledTimes(1);
      expect(offOutput).toHaveBeenCalledTimes(1);
      expect(offExit).toHaveBeenCalledTimes(1);
      expect(term.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
