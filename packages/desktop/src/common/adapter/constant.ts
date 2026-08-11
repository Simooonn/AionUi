/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const ADAPTER_BRIDGE_EVENT_KEY = 'office-ai-bridge-adapter';

/**
 * Embedded terminal (node-pty + xterm) channel names — single source of truth
 * shared by the preload `terminalAPI` and the main-process `terminalBridge`
 * (mirror values in `@process/terminal/types`; keep both ends in sync).
 *
 * Data plane = dedicated NATIVE channels (the typed bridge can't expose
 * `event.sender`, and would broadcast + 50MB-cap the high-rate output stream):
 *  - OUTPUT: main → originating webContents (`sender.send`), payload {id,data}.
 *  - INPUT:  renderer → main (`ipcMain.on`), binds sender + writes, payload {id,data}.
 *  - ATTACH: renderer → main (`ipcMain.handle`), re-binds sender + replays
 *            scrollback on reattach, payload {id}.
 * Control plane + the low-rate EXIT event ride the typed ipcBridge `terminal`
 * namespace; EXIT is a `buildEmitter('terminal:exit')` carried over
 * ADAPTER_BRIDGE_EVENT_KEY (payload {terminalId,exitCode,signal?}).
 */
export const TERMINAL_OUTPUT_CHANNEL = 'terminal:output';
export const TERMINAL_INPUT_CHANNEL = 'terminal:input';
export const TERMINAL_ATTACH_CHANNEL = 'terminal:attach';
export const TERMINAL_EXIT_EVENT = 'terminal:exit';
