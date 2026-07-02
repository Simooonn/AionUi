/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for terminalBridge IPC wiring (Step 3 acceptance).
 * Runs in the `node` Vitest project.
 *
 * Split transport under test (plan §2 (b)):
 *  - CONTROL on the typed `ipcBridge.terminal` providers
 *    (create / resize / dispose / disposeByConversation / list) + low-rate `exit` emitter.
 *  - DATA on native channels: terminal:input (on) binds sender + writes;
 *    terminal:attach (handle) binds sender + replays scrollback;
 *    terminal:output (sender.send) carries the coalesced stream (emitted by the manager).
 *
 * `electron` and `@/common` (ipcBridge) are mocked; the bridge's `options.manager`
 * seam injects a fake manager so no native PTY addon and no real shell run.
 *
 * NOTE: the default-manager path (createDefaultManager → lazy
 * `require('@process/terminal/ptyFactory')`) and its exit-mapping/output flow are
 * NOT exercised here — vitest cannot intercept that inline CJS require (the alias
 * is vite-only). The manager-side guarantees (emitExit payload, coalesced
 * terminal:output send) are fully covered in TerminalManager.test.ts. Requested a
 * small `options.spawn` testability seam from MainProc to also assert the bridge's
 * conversationId-drop exit mapping; the two affected cases are marked todo below.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  providers: {} as Record<string, (...args: unknown[]) => unknown>,
  ons: new Map<string, (...args: unknown[]) => unknown>(),
  handles: new Map<string, (...args: unknown[]) => unknown>(),
  exitEmit: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, fn: (...args: unknown[]) => unknown) => H.ons.set(channel, fn),
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => H.handles.set(channel, fn),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      create: { provider: (fn: (...a: unknown[]) => unknown) => (H.providers.create = fn) },
      resize: { provider: (fn: (...a: unknown[]) => unknown) => (H.providers.resize = fn) },
      dispose: { provider: (fn: (...a: unknown[]) => unknown) => (H.providers.dispose = fn) },
      disposeByConversation: {
        provider: (fn: (...a: unknown[]) => unknown) => (H.providers.disposeByConversation = fn),
      },
      list: { provider: (fn: (...a: unknown[]) => unknown) => (H.providers.list = fn) },
      exit: { emit: H.exitEmit },
    },
  },
}));

import { getTerminalManager, initTerminalBridge } from '@/process/bridge/terminalBridge';
import { TERMINAL_ATTACH_CHANNEL, TERMINAL_INPUT_CHANNEL } from '@/process/terminal/types';

/** A fake manager exposing the methods the bridge delegates to. */
function createFakeManager() {
  return {
    create: vi.fn(() => ({ terminalId: 't-fake', pid: 4242 })),
    resize: vi.fn(),
    dispose: vi.fn(),
    disposeByConversation: vi.fn(),
    list: vi.fn(() => []),
    write: vi.fn(),
    bindSender: vi.fn(),
    replayBuffer: vi.fn(),
  };
}

function fakeSender() {
  return { send: vi.fn(), isDestroyed: vi.fn(() => false) };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(H.providers)) delete H.providers[k];
  H.ons.clear();
  H.handles.clear();
});

describe('terminalBridge', () => {
  describe('registration', () => {
    it('registers the typed control providers and the native input/attach handlers', () => {
      initTerminalBridge({ manager: createFakeManager() as never });

      expect(typeof H.providers.create).toBe('function');
      expect(typeof H.providers.resize).toBe('function');
      expect(typeof H.providers.dispose).toBe('function');
      expect(typeof H.providers.disposeByConversation).toBe('function');
      expect(typeof H.providers.list).toBe('function');
      expect(H.ons.has(TERMINAL_INPUT_CHANNEL)).toBe(true);
      expect(H.handles.has(TERMINAL_ATTACH_CHANNEL)).toBe(true);
    });

    it('exposes the active manager via getTerminalManager', () => {
      const manager = createFakeManager();
      const returned = initTerminalBridge({ manager: manager as never });
      expect(returned).toBe(manager);
      expect(getTerminalManager()).toBe(manager);
    });
  });

  describe('control plane → manager', () => {
    it('terminal:create delegates to manager.create and returns { terminalId, pid }', async () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });

      // cwd must actually exist — nonexistent cwds go through the fallback chain.
      const params = { conversationId: 'c1', cwd: os.tmpdir(), cols: 80, rows: 24 };
      const result = await H.providers.create(params);

      expect(manager.create).toHaveBeenCalledWith(params);
      expect(result).toEqual({ terminalId: 't-fake', pid: 4242 });
    });

    describe('create cwd resolution (renderer cwd → DB workspace → homedir)', () => {
      it('passes a usable renderer cwd through and skips the DB lookup', async () => {
        const manager = createFakeManager();
        const resolveWorkspace = vi.fn(async () => '/never-used');
        initTerminalBridge({ manager: manager as never, resolveWorkspace });

        await H.providers.create({ conversationId: 'c1', cwd: os.tmpdir(), cols: 80, rows: 24 });

        expect(resolveWorkspace).not.toHaveBeenCalled();
        expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: os.tmpdir() }));
      });

      it('falls back to the conversation workspace when the renderer cwd is empty or missing', async () => {
        const manager = createFakeManager();
        const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'term-ws-'));
        const resolveWorkspace = vi.fn(async () => ws);
        initTerminalBridge({ manager: manager as never, resolveWorkspace });

        await H.providers.create({ conversationId: 'c1', cwd: '', cols: 80, rows: 24 });

        expect(resolveWorkspace).toHaveBeenCalledWith('c1');
        expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: ws }));
        fs.rmSync(ws, { recursive: true, force: true });
      });

      it('falls back to homedir when neither renderer cwd nor DB workspace is usable', async () => {
        const manager = createFakeManager();
        const resolveWorkspace = vi.fn(async () => '/nonexistent-db-workspace');
        initTerminalBridge({ manager: manager as never, resolveWorkspace });

        await H.providers.create({ conversationId: 'c1', cwd: '/nonexistent-renderer-cwd', cols: 80, rows: 24 });

        expect(manager.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: os.homedir() }));
      });
    });

    it('terminal:resize delegates to manager.resize', async () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });
      await H.providers.resize({ terminalId: 't1', cols: 100, rows: 30 });
      expect(manager.resize).toHaveBeenCalledWith('t1', 100, 30);
    });

    it('terminal:dispose delegates to manager.dispose', async () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });
      await H.providers.dispose({ terminalId: 't1' });
      expect(manager.dispose).toHaveBeenCalledWith('t1');
    });

    it('terminal:disposeByConversation delegates to manager.disposeByConversation', async () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });
      await H.providers.disposeByConversation({ conversationId: 'c1' });
      expect(manager.disposeByConversation).toHaveBeenCalledWith('c1');
    });

    it('terminal:list delegates to manager.list', async () => {
      const manager = createFakeManager();
      manager.list.mockReturnValue([{ terminalId: 't1' }] as never);
      initTerminalBridge({ manager: manager as never });

      const result = await H.providers.list({ conversationId: 'c1' });
      expect(manager.list).toHaveBeenCalledWith('c1');
      expect(result).toEqual([{ terminalId: 't1' }]);
    });
  });

  describe('input plane (native terminal:input)', () => {
    it('binds the originating sender and forwards the keystroke to manager.write', () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });

      const sender = fakeSender();
      H.ons.get(TERMINAL_INPUT_CHANNEL)!({ sender }, { terminalId: 't1', data: 'ls\n' });

      expect(manager.bindSender).toHaveBeenCalledWith('t1', sender);
      expect(manager.write).toHaveBeenCalledWith('t1', 'ls\n');
    });
  });

  describe('attach plane (native terminal:attach)', () => {
    it('binds the current sender and replays the scrollback', () => {
      const manager = createFakeManager();
      initTerminalBridge({ manager: manager as never });

      const sender = fakeSender();
      H.handles.get(TERMINAL_ATTACH_CHANNEL)!({ sender }, { terminalId: 't1' });

      expect(manager.bindSender).toHaveBeenCalledWith('t1', sender);
      expect(manager.replayBuffer).toHaveBeenCalledWith('t1');
    });
  });

  // Pending an `options.spawn` testability seam from MainProc (see file header):
  // the default-manager path's inline require can't be intercepted by vitest.
  describe('exit plane (typed emitter) [needs options.spawn seam]', () => {
    it.todo('maps a manager exit onto the terminal:exit emitter, dropping conversationId');
  });

  describe('output plane (native terminal:output) [needs options.spawn seam]', () => {
    it.todo('delivers coalesced output to the attached sender on terminal:output');
  });
});
