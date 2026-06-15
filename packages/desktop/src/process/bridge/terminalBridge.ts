/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal Bridge — wires the embedded terminal's IPC.
 *
 * Split transport (see plan §2 decision (b)):
 *  - CONTROL plane on the typed `ipcBridge.terminal` namespace (create/resize/dispose/
 *    list) + the low-rate `exit` emitter. The typed bridge cannot expose `event.sender`,
 *    so it is unsuitable for the targeted output stream and sender binding.
 *  - DATA plane on dedicated NATIVE channels, where `event.sender` is available:
 *      · `terminal:input`  (ipcMain.on)     → bind sender + forward keystrokes
 *      · `terminal:attach` (ipcMain.handle) → bind sender + replay scrollback (reattach)
 *      · `terminal:output` (sender.send)    → targeted, coalesced output (emitted by the manager)
 *
 * `initTerminalBridge` is invoked only from `initAllBridges()` in the Electron main
 * process, which is what keeps the native handlers Electron-only.
 */

import { ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ipcBridge } from '@/common';
import { createNodePtySpawn } from '@process/terminal/ptyFactory';
import { TerminalManager } from '@process/terminal/TerminalManager';
import type { TerminalAttachPayload, TerminalExitEvent, TerminalOutputPayload } from '@process/terminal/types';
import { TERMINAL_ATTACH_CHANNEL, TERMINAL_INPUT_CHANNEL } from '@process/terminal/types';

/** Active manager singleton — also consumed by quit cleanup (`getTerminalManager`). */
let activeManager: TerminalManager | null = null;

/** The current terminal manager, or null before `initTerminalBridge` runs. */
export function getTerminalManager(): TerminalManager | null {
  return activeManager;
}

/** Build the production manager backed by the native `@lydell/node-pty` spawner. */
function createDefaultManager(): TerminalManager {
  // `createNodePtySpawn` lazy-requires `@lydell/node-pty` internally, so importing this
  // bridge (in unit tests / non-Electron contexts) never loads the native addon — the
  // prebuilt `.node` is only required when this factory is actually invoked.
  return new TerminalManager({
    spawn: createNodePtySpawn(),
    emitExit: emitTerminalExit,
  });
}

/** Forward a manager exit event onto the typed low-rate `exit` emitter. */
function emitTerminalExit(event: TerminalExitEvent): void {
  ipcBridge.terminal.exit.emit({
    terminalId: event.terminalId,
    exitCode: event.exitCode,
    signal: event.signal,
  });
}

/**
 * Initialize the terminal bridge. `options.manager` lets tests inject a fake manager
 * (and skips loading the native PTY addon).
 */
export function initTerminalBridge(options: { manager?: TerminalManager } = {}): TerminalManager {
  const manager = options.manager ?? createDefaultManager();
  activeManager = manager;

  // --- Control plane (typed bridge) ---------------------------------------
  ipcBridge.terminal.create.provider((params) => Promise.resolve(manager.create(params)));

  ipcBridge.terminal.resize.provider(({ terminalId, cols, rows }) => {
    manager.resize(terminalId, cols, rows);
    return Promise.resolve();
  });

  ipcBridge.terminal.dispose.provider(({ terminalId }) => {
    manager.dispose(terminalId);
    return Promise.resolve();
  });

  // Conversation delete (not switch): the renderer calls this alongside
  // `conversation.remove` so the deleted conversation's PTYs are killed. Deletion
  // itself runs in the aioncore backend over HTTP, which never reaches the main
  // process — hence an explicit renderer-driven sweep here.
  ipcBridge.terminal.disposeByConversation.provider(({ conversationId }) => {
    manager.disposeByConversation(conversationId);
    return Promise.resolve();
  });

  ipcBridge.terminal.list.provider(({ conversationId }) => Promise.resolve(manager.list(conversationId)));

  // --- Data plane (native channels, Electron-only) ------------------------
  // INPUT: bind the originating sender (defensive re-bind on every keystroke), then write.
  ipcMain.on(TERMINAL_INPUT_CHANNEL, (event: IpcMainEvent, payload: TerminalOutputPayload) => {
    manager.bindSender(payload.terminalId, event.sender);
    manager.write(payload.terminalId, payload.data);
  });

  // ATTACH: bind the current sender and replay scrollback — the reattach primitive.
  ipcMain.handle(TERMINAL_ATTACH_CHANNEL, (event: IpcMainInvokeEvent, payload: TerminalAttachPayload) => {
    manager.bindSender(payload.terminalId, event.sender);
    manager.replayBuffer(payload.terminalId);
  });

  return manager;
}
