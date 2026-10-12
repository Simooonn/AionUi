/**
 * Tests for the ACP chat HUD statusline:
 * - ansiText.parseAnsiLine: minimal SGR parsing into styled segments
 * - process/ace/hudStatusline: param validation, the synthesized payload, the
 *   real context window (AC1/AC2/AC3/AC7), the no-data paths (AC6a/AC6b) and
 *   the ctx-segment stripping
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
import { parseHudStatuslineParams, readHudStatusline, stripContextSegment } from '@process/ace/hudStatusline';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

// HudStatusBar reads the LIVE model from the shared config-options snapshot
// (v0.1.41 removed the discrete /model endpoint).
const useAcpConfigOptionsMock = vi.hoisted(() => vi.fn(() => ({ model: null })));
vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  useAcpConfigOptions: useAcpConfigOptionsMock,
}));

const ESC = '\x1b';
// OMC replaces every space with a NBSP outside safe mode.
const NBSP = '\u00a0';

/** One main-chain assistant transcript line carrying `message.usage`. */
const mainChainUsage = (usage: Record<string, number>): string =>
  JSON.stringify({ type: 'assistant', isSidechain: false, message: { usage } });

/** Main-chain usage totalling 171,433 tokens (3 + 1,200 + 169,730 + 500). */
const USAGE_171K = {
  input_tokens: 3,
  cache_creation_input_tokens: 1_200,
  cache_read_input_tokens: 169_730,
  output_tokens: 500,
};

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

describe('parseHudStatuslineParams', () => {
  it('keeps a finite positive contextLimit', () => {
    expect(parseHudStatuslineParams({ workspace: '/ws', contextLimit: 1_000_000 })).toEqual({
      workspace: '/ws',
      conversationId: undefined,
      modelId: undefined,
      modelLabel: undefined,
      contextLimit: 1_000_000,
    });
  });

  it.each([
    ['NaN', NaN],
    ['-1', -1],
    ['0', 0],
    ["'1000000'", '1000000'],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('drops a non-positive or non-numeric contextLimit (%s)', (_label, contextLimit) => {
    expect(parseHudStatuslineParams({ workspace: '/ws', contextLimit })?.contextLimit).toBeUndefined();
  });

  it.each([[undefined], [''], [42], [null]])('returns null without a usable workspace (%s)', (workspace) => {
    expect(parseHudStatuslineParams({ workspace })).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    expect(parseHudStatuslineParams(undefined)).toBeNull();
  });

  it('drops non-string conversationId / modelId / modelLabel', () => {
    expect(parseHudStatuslineParams({ workspace: '/ws', conversationId: 1, modelId: {}, modelLabel: [] })).toEqual({
      workspace: '/ws',
      conversationId: undefined,
      modelId: undefined,
      modelLabel: undefined,
      contextLimit: undefined,
    });
  });
});

describe('stripContextSegment', () => {
  const SEP = `${ESC}[2m | ${ESC}[0m`;
  const NBSP_SEP = `${ESC}[2m${NBSP}|${NBSP}${ESC}[0m`;

  it('removes a plain ctx element', () => {
    expect(stripContextSegment(`ctx:${ESC}[32m0%${ESC}[0m${SEP}model:x`)).toBe('model:x');
  });

  it('removes a safe-mode bar ctx element', () => {
    const ctx = `ctx:[${ESC}[32m${ESC}[2m----------${ESC}[0m]${ESC}[32m0%${ESC}[0m`;
    expect(stripContextSegment(`branch:main${SEP}${ctx}${SEP}model:x`)).toBe(`branch:main${SEP}model:x`);
  });

  it('removes a unicode bar ctx element joined by NBSP separators', () => {
    const ctx = `ctx:[${ESC}[32m${ESC}[2m░░░░░░░░░░${ESC}[0m]${ESC}[32m0%${ESC}[0m`;
    expect(stripContextSegment(`branch:main${NBSP_SEP}${ctx}${NBSP_SEP}model:x`)).toBe(`branch:main${NBSP_SEP}model:x`);
  });

  it('removes a CRITICAL ctx element', () => {
    const ctx = `ctx:[${ESC}[31m#########${ESC}[2m-${ESC}[0m]${ESC}[31m86% CRITICAL${ESC}[0m`;
    expect(stripContextSegment(`${ctx}${SEP}model:x`)).toBe('model:x');
  });

  it('removes a COMPRESS? ctx element', () => {
    expect(stripContextSegment(`model:x${SEP}ctx:${ESC}[33m82% COMPRESS?${ESC}[0m`)).toBe('model:x');
  });

  it('leaves no dangling separator when ctx is first or last', () => {
    expect(stripContextSegment(`ctx:0%${SEP}a:1${SEP}b:2`)).toBe(`a:1${SEP}b:2`);
    expect(stripContextSegment(`a:1${SEP}b:2${SEP}ctx:0%`)).toBe(`a:1${SEP}b:2`);
  });

  it('drops a ctx-only line but keeps the other lines', () => {
    expect(stripContextSegment('branch:main\nctx:0%\ndetail')).toBe('branch:main\ndetail');
  });

  it('preserves a pre-existing blank line', () => {
    expect(stripContextSegment('ctx:0% | model:x\n\ndetail')).toBe('model:x\n\ndetail');
  });

  it('returns text without a ctx element unchanged', () => {
    const text = `5h:45%${SEP}tok:${ESC}[32m12.3k${ESC}[0m\ncontext:please`;
    expect(stripContextSegment(text)).toBe(text);
  });

  it('removes the zh-CN 上下文 label too', () => {
    expect(stripContextSegment(`上下文:${ESC}[32m42%${ESC}[0m${SEP}model:x`)).toBe('model:x');
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

  const writeTranscript = (lines: string[]): string => {
    const transcript = path.join(workspace, 'session.jsonl');
    fs.writeFileSync(transcript, lines.join('\n') + '\n');
    return transcript;
  };

  /** Transcript whose tail carries usable main-chain usage (171,433 tokens). */
  const writeUsableTranscript = (): string => writeTranscript([mainChainUsage(USAGE_171K)]);

  /** A file the statusLine command can `cat` as its own (stdin-independent) output. */
  const writeOutputFixture = (content: string): string => {
    const fixture = path.join(workspace, 'hud-output.txt');
    fs.writeFileSync(fixture, content);
    return fixture;
  };

  type ContextWindow = {
    context_window_size: number;
    used_percentage: number;
    current_usage: Record<string, number>;
  };

  const payloadOf = (result: { text: string } | null): Record<string, unknown> => {
    expect(result).not.toBeNull();
    return JSON.parse(result!.text) as Record<string, unknown>;
  };

  const contextWindowOf = (result: { text: string } | null): ContextWindow =>
    payloadOf(result).context_window as ContextWindow;

  /** The numerator the HUD divides by the window size: the four usage fields summed. */
  const usageTotalOf = (result: { text: string } | null): number =>
    Object.values(contextWindowOf(result).current_usage).reduce((sum, value) => sum + value, 0);

  it('AC6b: returns null when no conversation is given', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline({ workspace })).toBeNull();
  });

  it('returns null when no statusLine command is configured', async () => {
    const transcript = writeUsableTranscript();
    expect(
      await readHudStatusline(
        { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
        { resolveTranscript: async () => transcript }
      )
    ).toBeNull();
  });

  it('AC6b: never replays the workspace HUD cache when there is no conversation', async () => {
    writeCache('{"transcript_path":"/other/session.jsonl","model":{"id":"other-model"}}');
    writeSettings({ type: 'command', command: 'cat' });
    expect(await readHudStatusline({ workspace })).toBeNull();
  });

  it('synthesizes the payload from this conversation (transcript_path, cwd, model)', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript(['{}']);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', modelId: 'claude-fable-5', modelLabel: 'Fable 5' },
      { resolveTranscript: async () => transcript }
    );

    const payload = payloadOf(result);
    expect(payload.transcript_path).toBe(transcript);
    expect(payload.cwd).toBe(workspace);
    expect(payload.model).toEqual({ id: 'claude-fable-5', display_name: 'Fable 5' });
  });

  it('AC1: sizes the window from contextLimit, not the model id', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeUsableTranscript();

    const result = await readHudStatusline(
      {
        workspace,
        conversationId: 'conv-1',
        modelId: 'fable',
        modelLabel: 'claude-fable-5-1',
        contextLimit: 1_000_000,
      },
      { resolveTranscript: async () => transcript }
    );

    const context_window = contextWindowOf(result);
    expect(context_window.context_window_size).toBe(1_000_000);
    expect(Math.round(context_window.used_percentage)).toBe(17);
  });

  it('AC1: ignores a [1m] marker in the model id', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeUsableTranscript();

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', modelId: 'claude-opus-4-8[1m]', contextLimit: 200_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(contextWindowOf(result).context_window_size).toBe(200_000);
  });

  it('AC2: counts in+cc+cr+out of the last main-chain call (110,290 + 874 -> 111,164)', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript([
      JSON.stringify({ type: 'user', message: { role: 'user' } }),
      mainChainUsage({
        input_tokens: 2,
        cache_creation_input_tokens: 1_288,
        cache_read_input_tokens: 109_000,
        output_tokens: 874,
      }),
      // A later SIDECHAIN turn carries the subagent's context, not ours.
      JSON.stringify({
        type: 'assistant',
        isSidechain: true,
        message: { usage: { input_tokens: 5, cache_read_input_tokens: 999_999 } },
      }),
      // An all-zero entry is not a real call either.
      mainChainUsage({
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      }),
    ]);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 1_000_000 },
      { resolveTranscript: async () => transcript }
    );

    const context_window = contextWindowOf(result);
    expect(context_window.current_usage).toEqual({
      input_tokens: 2,
      cache_creation_input_tokens: 1_288,
      cache_read_input_tokens: 109_000,
      output_tokens: 874,
    });
    expect(usageTotalOf(result)).toBe(111_164);
    expect(context_window.used_percentage).toBeCloseTo(11.1164, 6);
  });

  it('AC3: sums the four usage fields the way aioncore computes used', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript([
      mainChainUsage({
        input_tokens: 2,
        cache_creation_input_tokens: 2_285,
        cache_read_input_tokens: 124_242,
        output_tokens: 5_523,
      }),
    ]);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(usageTotalOf(result)).toBe(132_052);
  });

  it('AC7: drops to the post-compaction usage once the first post-compaction main-chain call lands', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript([
      mainChainUsage(USAGE_171K),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
      JSON.stringify({ type: 'user', isCompactSummary: true, message: { role: 'user' } }),
      mainChainUsage({
        input_tokens: 10,
        cache_creation_input_tokens: 1_000,
        cache_read_input_tokens: 18_890,
        output_tokens: 100,
      }),
    ]);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(usageTotalOf(result)).toBe(20_000);
  });

  it('AC7: keeps the pre-compaction usage until then', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript([
      mainChainUsage(USAGE_171K),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
      JSON.stringify({ type: 'user', isCompactSummary: true, message: { role: 'user' } }),
    ]);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(usageTotalOf(result)).toBe(171_433);
  });

  it.each([[undefined], [0], [NaN], [Infinity]])(
    'AC6a: omits context_window but keeps transcript_path when the window size is unknown (%s)',
    async (contextLimit) => {
      writeSettings({ type: 'command', command: 'cat' });
      const transcript = writeUsableTranscript();

      const result = await readHudStatusline(
        { workspace, conversationId: 'conv-1', contextLimit },
        { resolveTranscript: async () => transcript }
      );

      const payload = payloadOf(result);
      expect(payload.transcript_path).toBe(transcript);
      expect(payload).not.toHaveProperty('context_window');
    }
  );

  it('AC6a: omits context_window but keeps transcript_path when the transcript tail has no usable main-chain usage', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeTranscript(['{}', 'not-json']);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 1_000_000 },
      { resolveTranscript: async () => transcript }
    );

    const payload = payloadOf(result);
    expect(payload.transcript_path).toBe(transcript);
    expect(payload).not.toHaveProperty('context_window');
  });

  it('AC6a: sends context_window_size and used_percentage together or not at all', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const withData = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
      { resolveTranscript: async () => writeUsableTranscript() }
    );
    const context_window = contextWindowOf(withData);
    expect(typeof context_window.used_percentage).toBe('number');
    expect(context_window.used_percentage).toBeGreaterThan(0);
    expect(Number.isFinite(context_window.used_percentage)).toBe(true);
    expect(context_window.context_window_size).toBe(200_000);

    const withoutData = await readHudStatusline(
      { workspace, conversationId: 'conv-1' },
      { resolveTranscript: async () => writeUsableTranscript() }
    );
    expect(Object.prototype.hasOwnProperty.call(payloadOf(withoutData), 'context_window')).toBe(false);
  });

  it('AC6a: strips the ctx element from the output when no context data was sent', async () => {
    const fixture = writeOutputFixture('ctx:[----------]0% | branch:main');
    writeSettings({ type: 'command', command: `cat ${fixture}` });
    const transcript = writeTranscript(['{}']);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 1_000_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(result).toEqual({ text: 'branch:main' });
  });

  it('AC6a: keeps a real 0% ctx element when context data was sent', async () => {
    const fixture = writeOutputFixture('ctx:[----------]0% | branch:main');
    writeSettings({ type: 'command', command: `cat ${fixture}` });
    const transcript = writeUsableTranscript();

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 1_000_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(result).toEqual({ text: 'ctx:[----------]0% | branch:main' });
  });

  it('AC6a: returns null when the ctx element was the only output', async () => {
    const fixture = writeOutputFixture('ctx:[----------]0%');
    writeSettings({ type: 'command', command: `cat ${fixture}` });
    const transcript = writeTranscript(['{}']);

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1', contextLimit: 1_000_000 },
      { resolveTranscript: async () => transcript }
    );

    expect(result).toBeNull();
  });

  it('AC6b: returns null when the transcript resolver yields no path, even with a cache file present', async () => {
    writeCache('{"transcript_path":"/other/session.jsonl","model":{"id":"other-model"}}');
    writeSettings({ type: 'command', command: 'cat' });

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1' },
      { resolveTranscript: async () => null }
    );

    expect(result).toBeNull();
  });

  it('AC6b: treats a throwing transcript resolver as "no transcript" (returns null)', async () => {
    writeCache('{"from":"cache"}');
    writeSettings({ type: 'command', command: 'cat' });

    const result = await readHudStatusline(
      { workspace, conversationId: 'conv-1' },
      {
        resolveTranscript: async () => {
          throw new Error('db down');
        },
      }
    );

    expect(result).toBeNull();
  });

  it('assembly-stage failures reject instead of silently returning null', async () => {
    writeSettings({ type: 'command', command: 'cat' });
    const transcript = writeUsableTranscript();
    vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    try {
      await expect(
        readHudStatusline(
          { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
          { resolveTranscript: async () => transcript }
        )
      ).rejects.toThrow('boom');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns null when the command fails', async () => {
    writeSettings({ type: 'command', command: 'exit 3' });
    const transcript = writeUsableTranscript();
    expect(
      await readHudStatusline(
        { workspace, conversationId: 'conv-1', contextLimit: 200_000 },
        { resolveTranscript: async () => transcript }
      )
    ).toBeNull();
  });

  it('returns null for empty workspace path', async () => {
    expect(await readHudStatusline({ workspace: '' })).toBeNull();
  });
});

describe('HudStatusBar', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    useAcpConfigOptionsMock.mockReset();
    useAcpConfigOptionsMock.mockReturnValue({ model: null });
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
      modelLabel: undefined,
      contextLimit: undefined,
    });
  });

  it('AC1: forwards context_limit and the plain live model id', async () => {
    useAcpConfigOptionsMock.mockReturnValue({
      model: {
        id: 'model',
        category: 'model',
        currentValue: 'fable',
        options: [{ value: 'fable', label: 'claude-fable-5-1', description: 'Custom Fable model' }],
      },
    });
    const hudStatusline = vi.fn().mockResolvedValue({ text: 'line' });
    (window as unknown as { electronAPI: unknown }).electronAPI = { hudStatusline };
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' context_limit={1_000_000} />);

    await waitFor(() => {
      expect(hudStatusline).toHaveBeenCalledWith({
        workspace: '/tmp/ws',
        conversationId: 'c1',
        modelId: 'fable',
        modelLabel: 'claude-fable-5-1',
        contextLimit: 1_000_000,
      });
    });

    // A "(1M context)" hint in the option text must NOT be folded into the id.
    cleanup();
    hudStatusline.mockClear();
    useAcpConfigOptionsMock.mockReturnValue({
      model: {
        id: 'model',
        category: 'model',
        currentValue: 'sonnet',
        options: [{ value: 'sonnet', label: 'claude-sonnet-5', description: 'Custom Sonnet model (1M context)' }],
      },
    });
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' context_limit={200_000} />);

    await waitFor(() => {
      expect(hudStatusline).toHaveBeenCalledWith({
        workspace: '/tmp/ws',
        conversationId: 'c1',
        modelId: 'sonnet',
        modelLabel: 'claude-sonnet-5',
        contextLimit: 200_000,
      });
    });
  });

  it('omits contextLimit when the window size is unknown (0)', async () => {
    const hudStatusline = vi.fn().mockResolvedValue({ text: 'line' });
    (window as unknown as { electronAPI: unknown }).electronAPI = { hudStatusline };
    render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' context_limit={0} />);

    await waitFor(() => {
      expect(hudStatusline).toHaveBeenCalledWith({
        workspace: '/tmp/ws',
        conversationId: 'c1',
        modelId: undefined,
        modelLabel: undefined,
        contextLimit: undefined,
      });
    });
  });

  it('re-polls with the new contextLimit when context_limit becomes known', async () => {
    const hudStatusline = vi.fn().mockResolvedValue({ text: 'line' });
    (window as unknown as { electronAPI: unknown }).electronAPI = { hudStatusline };
    const { rerender } = render(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' context_limit={0} />);

    await waitFor(() => {
      expect(hudStatusline).toHaveBeenCalledTimes(1);
    });

    rerender(<HudStatusBar conversation_id='c1' workspace='/tmp/ws' context_limit={200_000} />);

    await waitFor(() => {
      expect(hudStatusline).toHaveBeenCalledTimes(2);
    });
    expect(hudStatusline).toHaveBeenLastCalledWith({
      workspace: '/tmp/ws',
      conversationId: 'c1',
      modelId: undefined,
      modelLabel: undefined,
      contextLimit: 200_000,
    });
  });
});
