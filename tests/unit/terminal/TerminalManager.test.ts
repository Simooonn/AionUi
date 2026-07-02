/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the main-process TerminalManager (Step 2 acceptance).
 * Runs in the `node` Vitest project.
 *
 * TerminalManager injects its PTY spawner and exit emitter, so these tests need
 * neither the native `@lydell/node-pty` addon nor Electron — they inject a
 * `createSpawnSpy()` fake and drive each terminal's output/exit directly. The
 * renderer output target is a fake `OutputTarget` (Electron's WebContents shape:
 * `send(channel, payload)` + `isDestroyed()`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalManager } from '@/process/terminal/TerminalManager';
import {
  TERMINAL_OUTPUT_CHANNEL,
  type OutputTarget,
  type TerminalExitEvent,
  type TerminalOutputPayload,
} from '@/process/terminal/types';
import { createSpawnSpy, type SpawnSpy } from './_fakePty';

const FLUSH_INTERVAL_MS = 16;
const FLUSH_MAX_BYTES = 64 * 1024;
const SCROLLBACK_CAP_CHARS = 256 * 1024;

type FakeOutput = OutputTarget & {
  /** Every (channel, payload) frame the manager sent, in order. */
  frames: Array<{ channel: string; payload: TerminalOutputPayload }>;
  /** Toggle to simulate a destroyed webContents. */
  destroyed: boolean;
};

/** A controllable output target (stands in for the renderer-bound webContents). */
function createOutput(destroyed = false): FakeOutput {
  const target: FakeOutput = {
    frames: [],
    destroyed,
    send(channel, payload) {
      target.frames.push({ channel, payload });
    },
    isDestroyed() {
      return target.destroyed;
    },
  };
  return target;
}

/** Convenience: the `data` strings sent on the output channel, in order. */
function datas(sink: FakeOutput): string[] {
  return sink.frames.map((f) => f.payload.data);
}

describe('TerminalManager', () => {
  let spawn: SpawnSpy;
  let emitExit: ReturnType<typeof vi.fn<(e: TerminalExitEvent) => void>>;
  let manager: TerminalManager;

  beforeEach(() => {
    spawn = createSpawnSpy();
    emitExit = vi.fn();
    manager = new TerminalManager({ spawn: spawn.fn, emitExit });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('returns a string terminalId and the spawned pid, and registers the entry', () => {
      const result = manager.create({ conversationId: 'c1', cwd: '/ws' });

      expect(typeof result.terminalId).toBe('string');
      expect(result.terminalId.length).toBeGreaterThan(0);
      expect(result.pid).toBe(spawn.lastPty!.pid);
      expect(manager.size).toBe(1);
    });

    it('spawns a login shell from $SHELL with -l, the workspace cwd, and the requested geometry', () => {
      vi.stubEnv('SHELL', '/bin/bash');
      manager.create({ conversationId: 'c1', cwd: '/ws/a', cols: 120, rows: 40 });

      expect(spawn.last).toMatchObject({
        file: '/bin/bash',
        args: ['-l'],
        cwd: '/ws/a',
        cols: 120,
        rows: 40,
      });
    });

    it('falls back to /bin/zsh when $SHELL is unset', () => {
      vi.stubEnv('SHELL', '');
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(spawn.last!.file).toBe('/bin/zsh');
    });

    it('honors an explicit shell override over $SHELL', () => {
      vi.stubEnv('SHELL', '/bin/bash');
      manager.create({ conversationId: 'c1', cwd: '/ws', shell: '/usr/bin/fish' });
      expect(spawn.last!.file).toBe('/usr/bin/fish');
    });

    it('defaults geometry to 80x24 when cols/rows are omitted', () => {
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(spawn.last).toMatchObject({ cols: 80, rows: 24 });
    });

    it('forces TERM=xterm-256color and forwards inherited env', () => {
      vi.stubEnv('AIONUI_TEST_ENV', 'present');
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(spawn.last!.env.TERM).toBe('xterm-256color');
      expect(spawn.last!.env.AIONUI_TEST_ENV).toBe('present');
    });

    it('produces distinct terminalIds per create', () => {
      const a = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const b = manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(a.terminalId).not.toBe(b.terminalId);
      expect(manager.size).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // write / resize passthrough
  // ---------------------------------------------------------------------------
  describe('write', () => {
    it('forwards input to the underlying pty', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.write(terminalId, 'ls -la\n');
      expect(spawn.lastPty!.writes).toEqual(['ls -la\n']);
    });

    it('is a safe no-op for an unknown terminal id', () => {
      expect(() => manager.write('nope', 'x')).not.toThrow();
    });

    it('does not write after the shell has exited', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitExit(0);
      manager.write(terminalId, 'too late');
      expect(spawn.lastPty!.writes).toEqual([]);
    });
  });

  describe('resize', () => {
    it('forwards to pty.resize and updates the reported geometry', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.resize(terminalId, 100, 30);
      expect(spawn.lastPty!.resizes).toEqual([{ cols: 100, rows: 30 }]);
      expect(manager.list('c1')[0]).toMatchObject({ cols: 100, rows: 30 });
    });

    it('ignores non-positive dimensions', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.resize(terminalId, 0, 30);
      manager.resize(terminalId, 100, -1);
      expect(spawn.lastPty!.resizes).toEqual([]);
    });

    it('is a safe no-op for an unknown id and after exit', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitExit(0);
      expect(() => manager.resize('nope', 80, 24)).not.toThrow();
      manager.resize(terminalId, 80, 24);
      expect(spawn.lastPty!.resizes).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getBuffer (scrollback ring) — the replay source the bridge's attach uses
  // ---------------------------------------------------------------------------
  describe('getBuffer (scrollback ring)', () => {
    it('accumulates pty output for replay-on-reattach', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('hello ');
      spawn.lastPty!.__emitData('world');
      expect(manager.getBuffer(terminalId)).toBe('hello world');
    });

    it('retains output even while no sender is bound', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('offline output');
      expect(manager.getBuffer(terminalId)).toBe('offline output');
    });

    it('caps the ring buffer, trimming from the front', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const head = 'A'.repeat(1000);
      const tail = 'B'.repeat(SCROLLBACK_CAP_CHARS);
      spawn.lastPty!.__emitData(head);
      spawn.lastPty!.__emitData(tail);

      const buf = manager.getBuffer(terminalId);
      expect(buf.length).toBe(SCROLLBACK_CAP_CHARS);
      expect(buf.endsWith('B')).toBe(true);
      expect(buf.includes('A')).toBe(false);
    });

    it('returns empty string for a fresh terminal and for an unknown id', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(manager.getBuffer(terminalId)).toBe('');
      expect(manager.getBuffer('nope')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('returns only the terminals belonging to the conversation', () => {
      const a = manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.create({ conversationId: 'c2', cwd: '/ws' });
      const b = manager.create({ conversationId: 'c1', cwd: '/ws' });

      const ids = manager.list('c1').map((t) => t.terminalId);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(expect.arrayContaining([a.terminalId, b.terminalId]));
    });

    it('returns an empty array for a conversation with no terminals', () => {
      expect(manager.list('ghost')).toEqual([]);
    });

    it('exposes serializable info (cwd, pid, status, geometry)', () => {
      const { terminalId, pid } = manager.create({ conversationId: 'c1', cwd: '/ws/x', cols: 90, rows: 25 });
      expect(manager.list('c1')[0]).toEqual({
        terminalId,
        conversationId: 'c1',
        cwd: '/ws/x',
        pid,
        status: 'running',
        cols: 90,
        rows: 25,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // bindSender / unbindSender + output batching (16ms / 64KB)
  // ---------------------------------------------------------------------------
  describe('output batching', () => {
    it('bindSender returns true for a known terminal and false for an unknown one', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      expect(manager.bindSender(terminalId, createOutput())).toBe(true);
      expect(manager.bindSender('nope', createOutput())).toBe(false);
    });

    it('coalesces multiple chunks within the ~16ms window into a single terminal:output frame', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      spawn.lastPty!.__emitData('a');
      spawn.lastPty!.__emitData('b');
      spawn.lastPty!.__emitData('c');
      expect(sink.frames).toEqual([]); // nothing sent before the frame elapses

      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
      expect(sink.frames).toEqual([{ channel: TERMINAL_OUTPUT_CHANNEL, payload: { terminalId, data: 'abc' } }]);
    });

    it('opens a fresh window per flush (separate sends across frames)', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      spawn.lastPty!.__emitData('first');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
      spawn.lastPty!.__emitData('second');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      expect(datas(sink)).toEqual(['first', 'second']);
    });

    it('flushes immediately once the 64KB threshold is reached (no timer wait)', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      const big = 'x'.repeat(FLUSH_MAX_BYTES);
      spawn.lastPty!.__emitData(big);
      // Sent synchronously, before any timer advance.
      expect(datas(sink)).toEqual([big]);
    });

    it('skips the send when the sender is destroyed but keeps scrollback', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput(true);
      manager.bindSender(terminalId, sink);

      spawn.lastPty!.__emitData('lost to dead sender');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      expect(sink.frames).toEqual([]);
      expect(manager.getBuffer(terminalId)).toBe('lost to dead sender');
    });

    it('does not send when no sender is bound', () => {
      vi.useFakeTimers();
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('unbound');
      expect(() => vi.advanceTimersByTime(FLUSH_INTERVAL_MS)).not.toThrow();
    });

    it('unbindSender detaches the sender so later flushes are dropped', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);
      manager.unbindSender(terminalId);

      spawn.lastPty!.__emitData('after unbind');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
      expect(sink.frames).toEqual([]);
    });

    it('re-binding a new sender routes subsequent output to it', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const first = createOutput();
      const second = createOutput();
      manager.bindSender(terminalId, first);

      spawn.lastPty!.__emitData('to-first');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      manager.bindSender(terminalId, second);
      spawn.lastPty!.__emitData('to-second');
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      expect(datas(first)).toEqual(['to-first']);
      expect(datas(second)).toEqual(['to-second']);
    });
  });

  // ---------------------------------------------------------------------------
  // replayBuffer (reattach primitive)
  // ---------------------------------------------------------------------------
  describe('replayBuffer (reattach)', () => {
    it('replays the retained scrollback to the bound sender in one frame', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('line1\n');
      spawn.lastPty!.__emitData('line2\n');

      const sink = createOutput();
      manager.bindSender(terminalId, sink);
      manager.replayBuffer(terminalId);

      expect(sink.frames).toEqual([
        { channel: TERMINAL_OUTPUT_CHANNEL, payload: { terminalId, data: 'line1\nline2\n' } },
      ]);
    });

    it('is a no-op when no sender is bound', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('buffered');
      expect(() => manager.replayBuffer(terminalId)).not.toThrow();
    });

    it('is a no-op when the bound sender is destroyed', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitData('buffered');
      const sink = createOutput(true);
      manager.bindSender(terminalId, sink);
      manager.replayBuffer(terminalId);
      expect(sink.frames).toEqual([]);
    });

    it('does not send an empty frame when there is no scrollback', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);
      manager.replayBuffer(terminalId);
      expect(sink.frames).toEqual([]);
    });

    it('folds pending bytes into the replay so the next timer flush does not double-send', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      spawn.lastPty!.__emitData('pending-and-buffered'); // buffered, timer pending
      manager.replayBuffer(terminalId);
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      // Exactly one frame (the replay); the pending flush was cancelled/cleared.
      expect(datas(sink)).toEqual(['pending-and-buffered']);
    });
  });

  // ---------------------------------------------------------------------------
  // exit handling
  // ---------------------------------------------------------------------------
  describe('exit handling', () => {
    it('emits the exit event with code/signal and conversation context', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitExit(137, 9);

      expect(emitExit).toHaveBeenCalledTimes(1);
      expect(emitExit).toHaveBeenCalledWith({
        terminalId,
        conversationId: 'c1',
        exitCode: 137,
        signal: 9,
      });
    });

    it('marks the terminal exited but does NOT auto-dispose it', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      spawn.lastPty!.__emitExit(0);

      expect(manager.size).toBe(1);
      expect(manager.list('c1')[0]).toMatchObject({ terminalId, status: 'exited' });
    });

    it('flushes tail output before the exit event fires', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      spawn.lastPty!.__emitData('bye\n'); // buffered, timer not yet elapsed
      spawn.lastPty!.__emitExit(0); // exit flushes the tail synchronously

      expect(datas(sink)).toEqual(['bye\n']);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose lifecycle
  // ---------------------------------------------------------------------------
  describe('dispose lifecycle', () => {
    it('dispose kills the pty and removes the entry', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const pty = spawn.lastPty!;
      manager.dispose(terminalId);

      expect(pty.killed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.getBuffer(terminalId)).toBe('');
      expect(manager.list('c1')).toEqual([]);
    });

    it('dispose is a safe no-op for an unknown id', () => {
      expect(() => manager.dispose('nope')).not.toThrow();
    });

    it('dispose unsubscribes the pty listeners and cancels a pending flush', () => {
      vi.useFakeTimers();
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const pty = spawn.lastPty!;
      const sink = createOutput();
      manager.bindSender(terminalId, sink);

      pty.__emitData('pending'); // schedules a flush timer
      manager.dispose(terminalId);
      vi.advanceTimersByTime(FLUSH_INTERVAL_MS);

      expect(sink.frames).toEqual([]); // timer was cancelled by dispose
      expect(pty.__dataListenerCount()).toBe(0);
      expect(pty.__exitListenerCount()).toBe(0);
    });

    it('does not re-kill a process that already exited', () => {
      const { terminalId } = manager.create({ conversationId: 'c1', cwd: '/ws' });
      const pty = spawn.lastPty!;
      pty.__emitExit(0);
      manager.dispose(terminalId);

      expect(pty.killed).toBe(false);
      expect(manager.size).toBe(0);
    });

    it('disposeByConversation removes only that conversation’s terminals', () => {
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.create({ conversationId: 'c2', cwd: '/ws' });

      manager.disposeByConversation('c1');

      expect(manager.list('c1')).toEqual([]);
      expect(manager.list('c2')).toHaveLength(1);
      expect(manager.size).toBe(1);
    });

    it('disposeAll kills every pty and empties the manager', () => {
      manager.create({ conversationId: 'c1', cwd: '/ws' });
      manager.create({ conversationId: 'c2', cwd: '/ws' });
      const ptys = [...spawn.instances];

      manager.disposeAll();

      expect(ptys.every((p) => p.killed)).toBe(true);
      expect(manager.size).toBe(0);
    });
  });
});
