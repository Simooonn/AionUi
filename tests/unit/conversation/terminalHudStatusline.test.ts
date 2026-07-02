/**
 * Tests for the terminal-chat-view HUD statusline:
 * - ansiText.parseAnsiLine: minimal SGR parsing into styled segments
 * - process/ace/hudStatusline.readHudStatusline: cache + settings + command replay
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAnsiLine } from '@/renderer/pages/conversation/platforms/acp/terminalChatView/ansiText';
import { readHudStatusline } from '@process/ace/hudStatusline';

const ESC = '\x1b';

describe('parseAnsiLine', () => {
  it('passes plain text through as one unstyled segment', () => {
    expect(parseAnsiLine('hello world')).toEqual([{ text: 'hello world', classes: [] }]);
  });

  it('applies color and reset codes', () => {
    const segs = parseAnsiLine(`${ESC}[32mgreen${ESC}[0m plain`);
    expect(segs).toEqual([
      { text: 'green', classes: ['fgGreen'] },
      { text: ' plain', classes: [] },
    ]);
  });

  it('stacks bold/dim with color and clears via 22', () => {
    const segs = parseAnsiLine(`${ESC}[1;31mboldred${ESC}[22mred`);
    expect(segs).toEqual([
      { text: 'boldred', classes: ['bold', 'fgRed'] },
      { text: 'red', classes: ['fgRed'] },
    ]);
  });

  it('treats bare ESC[m as full reset', () => {
    const segs = parseAnsiLine(`${ESC}[2mdim${ESC}[mnormal`);
    expect(segs).toEqual([
      { text: 'dim', classes: ['dim'] },
      { text: 'normal', classes: [] },
    ]);
  });

  it('consumes 256-color args without styling and strips non-SGR CSI', () => {
    const segs = parseAnsiLine(`${ESC}[38;5;196mx${ESC}[0m${ESC}[2Ky`);
    expect(segs).toEqual([{ text: 'xy', classes: [] }]);
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

  it('returns null when the workspace has no HUD cache', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline(workspace)).toBeNull();
  });

  it('returns null when no statusLine command is configured', async () => {
    writeCache('{"model":"x"}');
    expect(await readHudStatusline(workspace)).toBeNull();
  });

  it('pipes the cached payload through the configured command', async () => {
    writeCache('{"model":"x"}');
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline(workspace)).toEqual({ text: '{"model":"x"}' });
  });

  it('returns null when the command fails', async () => {
    writeCache('{"model":"x"}');
    writeSettings({ type: 'command', command: 'exit 3' });
    expect(await readHudStatusline(workspace)).toBeNull();
  });

  it('returns null for empty workspace path', async () => {
    expect(await readHudStatusline('')).toBeNull();
  });
});
