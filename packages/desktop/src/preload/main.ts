/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Hook Sentry IPC so the renderer SDK uses ipcRenderer.send instead of falling
// back to fetch('sentry-ipc://...'), which floods the DevTools Network panel.
// Bundled into this preload via `externalizeDepsPlugin({ exclude: [...] })` so
// Electron's sandbox-mode preload doesn't try to resolve it from node_modules.
import '@sentry/electron/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  ADAPTER_BRIDGE_EVENT_KEY,
  TERMINAL_ATTACH_CHANNEL,
  TERMINAL_EXIT_EVENT,
  TERMINAL_INPUT_CHANNEL,
  TERMINAL_OUTPUT_CHANNEL,
} from '../common/adapter/constant';
import type { TerminalExitPayload, TerminalOutputPayload } from '../common/types/platform/electron';

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: any) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },
  on: (callback: any) => {
    const handler = (event: any, value: any) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // Feedback: collect and compress recent log files
  collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs'),
  // Feedback: capture a screenshot of the current window
  captureFeedbackScreenshot: () => ipcRenderer.invoke('feedback:capture-screenshot'),
  // Feedback: forward diagnostics logs to the main process console
  logFeedbackEvent: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) =>
    ipcRenderer.send('feedback:renderer-log', payload),
  // ace:start import local CLI (Claude Code/Codex) sessions
  importCliSessions: () => ipcRenderer.invoke('ace:import-cli-sessions'),
  importConversationMessages: (conversationId: string) =>
    ipcRenderer.invoke('ace:import-conversation-messages', conversationId),
  ensureCliResume: (conversationId: string) => ipcRenderer.invoke('ace:ensure-cli-resume', conversationId),
  resolveConversationFiles: (ids: string[]) => ipcRenderer.invoke('ace:resolve-conversation-files', ids),
  resolveResumeCommands: (ids: string[]) => ipcRenderer.invoke('ace:resolve-resume-commands', ids),
  unlinkSessionFiles: (paths: string[]) => ipcRenderer.invoke('ace:unlink-session-files', paths),
  deleteOpencodeSessions: (sessionIds: string[]) => ipcRenderer.invoke('ace:delete-opencode-sessions', sessionIds),
  checkWorkspacesExist: (paths: string[]) => ipcRenderer.invoke('ace:check-workspaces-exist', paths),
  larkNotifyGetConfig: () => ipcRenderer.invoke('ace:lark-notify-get-config'),
  larkNotifySaveConfig: (config: unknown) => ipcRenderer.invoke('ace:lark-notify-save-config', config),
  larkNotifyTest: () => ipcRenderer.invoke('ace:lark-notify-test'),
  larkNotifySend: (rows: unknown[]) => ipcRenderer.invoke('ace:lark-notify-send', rows),
  // ace:end
});

// Embedded terminal (node-pty + xterm) data plane. Mirrors the ace:* named
// pattern and the electronAPI.on cleanup style above. Control calls
// (create/resize/dispose/list) + the exit event go through the typed ipcBridge
// `terminal` namespace, NOT this surface. The high-rate output stream, input,
// and reattach ride dedicated NATIVE channels (the typed bridge can't expose
// `event.sender`, and would broadcast + 50MB-cap the stream).
//
// `terminalId` is the single id field on every channel here (renderer ↔ main),
// matching the main-process native wire, so frames are forwarded as-is.
contextBridge.exposeInMainWorld('terminalAPI', {
  // renderer → main: keystroke/paste input on the native input channel. Main
  // (re-)binds the originating sender from this event, then writes to the PTY.
  input: (terminalId: string, data: string) => {
    ipcRenderer.send(TERMINAL_INPUT_CHANNEL, { terminalId, data });
  },
  // renderer → main: re-bind this webContents as the output target and replay
  // the scrollback ring buffer (used on mount and after a reload). Fire-and-forget.
  attach: (terminalId: string) => {
    ipcRenderer.invoke(TERMINAL_ATTACH_CHANNEL, { terminalId }).catch((error) => {
      console.error('terminalAPI.attach IPC error:', error);
    });
  },
  // main → renderer: high-rate PTY output on the dedicated native channel,
  // targeted to this webContents. Renderer filters frames by its own terminalId.
  onOutput: (callback: (payload: TerminalOutputPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TerminalOutputPayload) => {
      callback(payload);
    };
    ipcRenderer.on(TERMINAL_OUTPUT_CHANNEL, handler);
    return () => {
      ipcRenderer.off(TERMINAL_OUTPUT_CHANNEL, handler);
    };
  },
  // main → renderer: low-rate exit event delivered via the typed ipcBridge
  // emitter, which arrives on the shared ADAPTER_BRIDGE_EVENT_KEY bus as a
  // serialized {name,data} frame; filter for the terminal:exit name. The
  // emitter payload already uses terminalId, so it is forwarded as-is.
  onExit: (callback: (payload: TerminalExitPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: string) => {
      try {
        const { name, data } = JSON.parse(value) as { name: string; data: TerminalExitPayload };
        if (name === TERMINAL_EXIT_EVENT) callback(data);
      } catch {
        /* ignore malformed frames */
      }
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
});

// Synchronously fetch the aioncore port and expose it to the renderer
// via contextBridge (direct window assignment is invisible under contextIsolation).
const backendPort = ipcRenderer.sendSync('get-backend-port') as number;
const initialLanguage = ipcRenderer.sendSync('get-initial-language') as string | null;
const backendStartupFailed = ipcRenderer.sendSync('get-backend-startup-failed') as boolean;
const backendStartupFailure = ipcRenderer.sendSync('get-backend-startup-failure') as unknown;
contextBridge.exposeInMainWorld('__backendPort', backendPort > 0 ? backendPort : 0);
contextBridge.exposeInMainWorld('__initialLanguage', initialLanguage ?? null);
contextBridge.exposeInMainWorld('__aionuiE2ETest', process.env.AIONUI_E2E_TEST === '1');
contextBridge.exposeInMainWorld('__backendStartupFailed', backendStartupFailed === true);
contextBridge.exposeInMainWorld('__backendStartupFailure', backendStartupFailure ?? null);

// 托盘事件监听 - 将 IPC 事件转换为 DOM 事件
// Tray event listeners - convert IPC events to DOM events
const trayEvents = [
  'tray:navigate-to-guid',
  'tray:navigate-to-conversation',
  'tray:open-about',
  'tray:pause-all-tasks',
  'tray:check-update',
];

for (const channel of trayEvents) {
  ipcRenderer.on(channel, (_event, ...args) => {
    window.dispatchEvent(new CustomEvent(channel, { detail: args[0] }));
  });
}
