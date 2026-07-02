/**
 * Tests for the ACP chat HUD statusline:
 * - ansiText.parseAnsiLine: minimal SGR parsing into styled segments
 * - process/ace/hudStatusline.readHudStatusline: synthesized payload, cache
 *   fallback, and all null (auto-hide) paths
 * - HudStatusBar component: renders lines when data exists, null otherwise
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAnsiLine } from '@/renderer/pages/conversation/platforms/acp/hudStatusBar/ansiText';
import HudStatusBar from '@/renderer/pages/conversation/platforms/acp/hudStatusBar/HudStatusBar';
import { readHudStatusline } from '@process/ace/hudStatusline';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

const ESC = '\x1b';

describe('parseAnsiLine', () => {
  it('passes plain text through as one unstyled segment', () => {
    expect(parseAnsiLine('hello world')).toEqual([{ text: 'hello world', classes: [] }]);
  });

  it('applies color and reset codes', () => {
    expect(parseAnsiLine(`${ESC}[32mgreen${ESC}[0m plain`)).toEqual([
      { text: 'green', classes: ['fgGreen'] },
      { text: ' plain', classes: [] },
    ]);
  });

  it('stacks bold/dim with color and clears via 22', () => {
    expect(parseAnsiLine(`${ESC}[1;31mboldred${ESC}[22mred`)).toEqual([
      { text: 'boldred', classes: ['bold', 'fgRed'] },
      { text: 'red', classes: ['fgRed'] },
    ]);
  });

  it('treats bare ESC[m as full reset', () => {
    expect(parseAnsiLine(`${ESC}[2mdim${ESC}[mnormal`)).toEqual([
      { text: 'dim', classes: ['dim'] },
      { text: 'normal', classes: [] },
    ]);
  });

  it('consumes 256-color args without styling and strips non-SGR CSI', () => {
    expect(parseAnsiLine(`${ESC}[38;5;196mx${ESC}[0m${ESC}[2Ky`)).toEqual([{ text: 'xy', classes: [] }]);
  });

  it('maps bright colors to the same palette', () => {
    expect(parseAnsiLine(`${ESC}[96mcyan`)).toEqual([{ text: 'cyan', classes: ['fgCyan'] }]);
  });
});

describe('readHudStatusline', () => {
  let workspace: string;
  let configDir: string;
  let prevConfigDir: string | undefined;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-ws-'));
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-cfg-'));
    prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  const writeCache = (payload: string) => {
    const dir = path.join(workspace, '.omc', 'state');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hud-stdin-cache.json'), payload);
  };

  const writeSettings = (statusLine: unknown) => {
    fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ statusLine }));
  };

  it('returns null when neither transcript nor cache is available', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline({ workspace })).toBeNull();
  });

  it('returns null when no statusLine command is configured', async () => {
    writeCache('{"model":"x"}');
    expect(await readHudStatusline({ workspace })).toBeNull();
  });

  it('replays the cached payload when no conversation transcript resolves', async () => {
    writeCache('{"model":"x"}');
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline({ workspace })).toEqual({ text: '{"model":"x"}' });
  });

  it('prefers the synthesized per-conversation payload over the cache', async () => {
    writeCache('{"from":"cache"}');
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = path.join(workspace, 'session.jsonl');
    fs.writeFileSync(transcript, '{}');

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', modelId: 'claude-fable-5', modelLabel: 'Fable 5' },
      { resolveTranscript: async () => transcript }
    );

    expect(result).not.toBeNull();
    const payload = JSON.parse(result!.text) as {
      transcript_path: string;
      cwd: string;
      model: { id: string; display_name: string };
    };
    expect(payload.transcript_path).toBe(transcript);
    expect(payload.cwd).toBe(workspace);
    expect(payload.model).toEqual({ id: 'claude-fable-5', display_name: 'Fable 5' });
  });

  it('falls back to the cache when the transcript resolver returns null', async () => {
    writeCache('{"from":"cache"}');
    writeSettings({ type: 'command', command: 'cat' });
    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1' },
      { resolveTranscript: async () => null }
    );
    expect(result).toEqual({ text: '{"from":"cache"}' });
  });

  it('returns null when the command fails', async () => {
    writeCache('{"model":"x"}');
    writeSettings({ type: 'command', command: 'exit 3' });
    expect(await readHudStatusline({ workspace })).toBeNull();
  });

  it('returns null for empty workspace path', async () => {
    expect(await readHudStatusline({ workspace: '' })).toBeNull();
  });
});

describe('HudStatusBar', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('renders nothing when the ace API is unavailable', () => {
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' />);
    expect(screen.queryByTestId('chat-hud-statusline')).toBeNull();
  });

  it('renders nothing when the IPC returns null', async () => {
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      hudStatusline: vi.fn().mockResolvedValue(null),
    };
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' />);
    await waitFor(() => {
      expect(screen.queryByTestId('chat-hud-statusline')).toBeNull();
    });
  });

  it('renders ANSI lines when the IPC returns text', async () => {
    const hudStatusline = vi.fn().mockResolvedValue({ text: `${ESC}[32mbranch:main${ESC}[0m\nModel: Fable 5` });
    (window as unknown as { electronAPI: unknown }).electronAPI = { hudStatusline };
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' current_model_id='claude-fable-5' />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-hud-statusline')).toBeTruthy();
    });
    expect(screen.getByText('branch:main')).toBeTruthy();
    expect(screen.getByText('Model: Fable 5')).toBeTruthy();
    expect(hudStatusline).toHaveBeenCalledWith({
      workspace: '/tmp/ws',
      conversationId: 'c1',
      modelId: 'claude-fable-5',
    });
  });
});
