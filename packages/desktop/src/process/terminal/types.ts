/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared identifiers and PTY abstraction types for the embedded terminal.
 *
 * `TerminalManager` is intentionally decoupled from the native `@lydell/node-pty`
 * module: it only depends on the {@link IPtyProcess}/{@link PtySpawnFn} interfaces
 * declared here. The real binding lives in `ptyFactory.ts` and is injected by the
 * bridge, which keeps the manager fully unit-testable without the native addon.
 */

/** Opaque per-terminal identifier (string, as agreed in the shared contract). */
export type TerminalId = string;

/** Conversation identifier a terminal belongs to (string). */
export type ConversationId = string;

/** Lifecycle status of a terminal's underlying shell process. */
export type TerminalStatus = 'running' | 'exited';

/** Disposable handle returned by PTY event subscriptions (node-pty compatible). */
export type IPtyDisposable = {
  dispose(): void;
};

/**
 * Minimal subset of node-pty's `IPty` that the manager relies on.
 * Kept deliberately small so a fake can stand in during tests.
 */
export type IPtyProcess = {
  readonly pid: number;
  onData(listener: (data: string) => void): IPtyDisposable;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): IPtyDisposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

/** Options passed to {@link PtySpawnFn} when spawning a shell. */
export type PtySpawnOptions = {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

/** Factory that spawns a PTY-backed shell process. Injected for testability. */
export type PtySpawnFn = (options: PtySpawnOptions) => IPtyProcess;

// Native data-plane channel names — single source of truth in the common adapter
// (shared with the preload `terminalAPI`); re-exported here for main-process use.
export { TERMINAL_OUTPUT_CHANNEL, TERMINAL_INPUT_CHANNEL, TERMINAL_ATTACH_CHANNEL } from '@/common/adapter/constant';

/** Payload carried on the native `terminal:output` / `terminal:input` channels. */
export type TerminalOutputPayload = {
  terminalId: TerminalId;
  data: string;
};

/** Payload carried on the native `terminal:attach` channel. */
export type TerminalAttachPayload = {
  terminalId: TerminalId;
};

/**
 * The originating renderer's output target, bound per terminal. Electron's
 * `WebContents` satisfies this structurally, so the manager stays decoupled from
 * Electron and a fake stands in during tests. `isDestroyed` lets the manager skip
 * sending to a gone `webContents`; the bytes remain in scrollback for the next replay.
 */
export type OutputTarget = {
  send: (channel: string, payload: TerminalOutputPayload) => void;
  isDestroyed: () => boolean;
};

/** Emitted when a terminal's shell process exits. */
export type TerminalExitEvent = {
  terminalId: TerminalId;
  conversationId: ConversationId;
  exitCode: number;
  signal?: number;
};

/** Parameters for creating a terminal. */
export type TerminalCreateParams = {
  conversationId: ConversationId;
  cwd: string;
  cols?: number;
  rows?: number;
  shell?: string;
};

/** Result of a successful terminal creation. */
export type TerminalCreateResult = {
  terminalId: TerminalId;
  pid: number;
};

/** Lightweight, serializable view of a terminal for `list`/reattach. */
export type TerminalInfo = {
  terminalId: TerminalId;
  conversationId: ConversationId;
  cwd: string;
  pid: number;
  status: TerminalStatus;
  cols: number;
  rows: number;
};

/** Dependencies injected into {@link TerminalManager}. */
export type TerminalManagerDeps = {
  /** Spawns the underlying PTY process. */
  spawn: PtySpawnFn;
  /** Emits the low-rate exit event over the typed bridge (transport-agnostic). */
  emitExit: (event: TerminalExitEvent) => void;
};
