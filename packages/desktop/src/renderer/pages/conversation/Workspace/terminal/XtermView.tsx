/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button } from '@arco-design/web-react';
import { FitAddon } from '@xterm/addon-fit';
import type { ITheme } from '@xterm/xterm';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface XtermViewProps {
  terminalId: string;
  /** True when this terminal is the focused tab AND the terminal panel is shown. */
  active: boolean;
  /** Restart request from the exit banner — parent disposes this PTY and spawns a fresh one. */
  onRestart: (terminalId: string) => void;
}

// Read a CSS custom property off the themed document root. Returns undefined
// when unset so xterm falls back to its own palette (no hardcoded colors here).
function readCssVar(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || undefined;
}

// Map the app's semantic theme tokens onto xterm's chrome colors. ANSI 16
// colors are intentionally left to xterm's defaults for fidelity.
function buildXtermTheme(): ITheme {
  return {
    background: readCssVar('--bg-base'),
    foreground: readCssVar('--text-primary'),
    cursor: readCssVar('--text-primary'),
    cursorAccent: readCssVar('--bg-base'),
    selectionBackground: readCssVar('--bg-active'),
  };
}

/**
 * Renders one PTY-backed terminal: wires keystrokes to the native input channel,
 * writes incoming output, replays scrollback on first mount, keeps the fit synced
 * to the panel size, and shows an exit banner with a Restart affordance.
 */
const XtermView: React.FC<XtermViewProps> = ({ terminalId, active, onRestart }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  // Defer xterm creation until the terminal is first shown (lazy-create), then
  // keep it mounted for the rest of its life so output keeps flowing live.
  const [initialized, setInitialized] = useState(active);
  useEffect(() => {
    if (active) setInitialized(true);
  }, [active]);

  const fitAndResize = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
    } catch {
      // fit() throws when the container has no layout box (e.g. hidden tab); ignore.
      return;
    }
    void ipcBridge.terminal.resize
      .invoke({ terminalId, cols: term.cols, rows: term.rows })
      .catch((): void => undefined);
  }, [terminalId]);

  // Create + wire the terminal once, dispose on unmount.
  useEffect(() => {
    const api = window.terminalAPI;
    if (!initialized || !containerRef.current || !api) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 5000,
      theme: buildXtermTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    // Keystrokes → main process (native data plane).
    const dataDisposable = term.onData((data) => api.input(terminalId, data));

    // Output / exit channels are shared across all terminals; filter by id.
    const offOutput = api.onOutput((payload) => {
      if (payload.terminalId === terminalId) term.write(payload.data);
    });
    const offExit = api.onExit((payload) => {
      if (payload.terminalId === terminalId) setExitCode(payload.exitCode);
    });

    // Bind this webContents as the output sender on the main side and replay
    // retained scrollback (frames arrive via onOutput). This is the reattach
    // primitive: create() binds no sender, so output only starts flowing once we
    // attach — and it re-binds after a reload/conversation switch. Then size to
    // the panel.
    api.attach(terminalId);
    fitAndResize();

    return () => {
      dataDisposable.dispose();
      offOutput();
      offExit();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [initialized, terminalId, fitAndResize]);

  // Re-fit when the panel regains size (becomes the active tab again).
  useEffect(() => {
    if (active && termRef.current) {
      const raf = requestAnimationFrame(() => fitAndResize());
      return () => cancelAnimationFrame(raf);
    }
  }, [active, fitAndResize]);

  // Re-fit on container resize (panel-width drag), debounced 100ms.
  useEffect(() => {
    const el = containerRef.current;
    if (!initialized || !el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fitAndResize(), 100);
    });
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [initialized, fitAndResize]);

  // Rebuild the xterm theme when the app theme switches.
  useEffect(() => {
    if (!initialized) return;
    const applyThemeToTerm = () => {
      if (termRef.current) termRef.current.options.theme = buildXtermTheme();
    };
    const observer = new MutationObserver(applyThemeToTerm);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [initialized]);

  const handleRestart = useCallback(() => {
    setExitCode(null);
    onRestart(terminalId);
  }, [onRestart, terminalId]);

  return (
    <div className='relative size-full' style={{ background: 'var(--bg-base)' }}>
      <div ref={containerRef} className='size-full' />
      {exitCode !== null && (
        <div
          className='absolute inset-x-0 top-0 flex items-center justify-between gap-12px px-12px py-8px text-12px'
          style={{
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--border-base)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>{t('conversation.workspace.terminal.exited', { code: exitCode })}</span>
          <Button size='mini' type='primary' onClick={handleRestart}>
            {t('conversation.workspace.terminal.restart')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default XtermView;
