/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main-process owner of every interactive terminal's lifecycle.
 *
 * The manager is the single source of truth: it holds the PTY processes, a bounded
 * scrollback ring buffer per terminal (for replay on reattach), and coalesces the
 * high-rate output stream into framed flushes before handing them to a bound output
 * sink. It is deliberately transport- and addon-agnostic — both the PTY spawner and
 * the exit emitter are injected, so it unit-tests without `@lydell/node-pty` or Electron.
 */

import { randomUUID } from 'node:crypto';
import type { ConversationId, IPtyDisposable, IPtyProcess, OutputTarget, TerminalCreateParams, TerminalCreateResult, TerminalExitEvent, TerminalId, TerminalInfo, TerminalManagerDeps, TerminalStatus } from './types';
import { TERMINAL_OUTPUT_CHANNEL } from './types';

/** Fallback shell when `$SHELL` is unset (GUI apps often inherit a stripped env). */
const DEFAULT_SHELL = '/bin/zsh';
/** Default geometry used until the renderer reports its measured size. */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
/** Coalesce window: flush at most once per frame (~16ms) ... */
const FLUSH_INTERVAL_MS = 16;
/** ... or immediately once this many pending bytes accumulate, whichever comes first. */
const FLUSH_MAX_BYTES = 64 * 1024;
/** Per-terminal scrollback cap retained for replay-on-reattach (~256KB). */
const SCROLLBACK_CAP_CHARS = 256 * 1024;

type PtyEntry = {
  terminalId: TerminalId;
  conversationId: ConversationId;
  cwd: string;
  pid: number;
  status: TerminalStatus;
  cols: number;
  rows: number;
  pty: IPtyProcess;
  /** Bounded scrollback retained for replay; trimmed to the cap from the front. */
  scrollback: string;
  /** Output accumulated since the last flush. */
  pendingData: string;
  pendingBytes: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Renderer-bound output target; null until bound / after the renderer detaches. */
  sender: OutputTarget | null;
  dataDisposable: IPtyDisposable;
  exitDisposable: IPtyDisposable;
};

export class TerminalManager {
  private readonly entries = new Map<TerminalId, PtyEntry>();
  private readonly spawn: TerminalManagerDeps['spawn'];
  private readonly emitExit: TerminalManagerDeps['emitExit'];

  constructor(deps: TerminalManagerDeps) {
    this.spawn = deps.spawn;
    this.emitExit = deps.emitExit;
  }

  /** Spawn a login shell rooted at the conversation's workspace directory. */
  create(params: TerminalCreateParams): TerminalCreateResult {
    const terminalId = randomUUID();
    const cols = params.cols ?? DEFAULT_COLS;
    const rows = params.rows ?? DEFAULT_ROWS;
    const file = params.shell || process.env.SHELL || DEFAULT_SHELL;

    const pty = this.spawn({
      file,
      // Login shell so the user's profile/PATH loads.
      args: ['-l'],
      cwd: params.cwd,
      env: this.buildEnv(),
      cols,
      rows,
    });

    const entry: PtyEntry = {
      terminalId,
      conversationId: params.conversationId,
      cwd: params.cwd,
      pid: pty.pid,
      status: 'running',
      cols,
      rows,
      pty,
      scrollback: '',
      pendingData: '',
      pendingBytes: 0,
      flushTimer: null,
      sender: null,
      dataDisposable: { dispose: () => {} },
      exitDisposable: { dispose: () => {} },
    };

    entry.dataDisposable = pty.onData((data) => this.handleData(entry, data));
    entry.exitDisposable = pty.onExit((event) => this.handleExit(entry, event));

    this.entries.set(terminalId, entry);
    return { terminalId, pid: pty.pid };
  }

  /** Forward renderer input to the shell. No-op for unknown/exited terminals. */
  write(terminalId: TerminalId, data: string): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.status !== 'running') return;
    entry.pty.write(data);
  }

  /** Resize the PTY and remember the new geometry. */
  resize(terminalId: TerminalId, cols: number, rows: number): void {
    const entry = this.entries.get(terminalId);
    if (!entry || entry.status !== 'running') return;
    if (cols <= 0 || rows <= 0) return;
    entry.cols = cols;
    entry.rows = rows;
    entry.pty.resize(cols, rows);
  }

  /** Return the retained scrollback for replay into a freshly mounted xterm. */
  getBuffer(terminalId: TerminalId): string {
    return this.entries.get(terminalId)?.scrollback ?? '';
  }

  /** List the terminals belonging to a conversation (lightweight, serializable). */
  list(conversationId: ConversationId): TerminalInfo[] {
    const result: TerminalInfo[] = [];
    for (const entry of this.entries.values()) {
      if (entry.conversationId !== conversationId) continue;
      result.push(this.toInfo(entry));
    }
    return result;
  }

  /**
   * Bind (or re-bind) the originating renderer's output target for a terminal.
   * Called from the native `terminal:attach` and `terminal:input` channels (where
   * `event.sender` is available) so output reaches the current `webContents` after
   * mount / Cmd-R / window reopen. Returns false if the terminal is unknown.
   */
  bindSender(terminalId: TerminalId, sender: OutputTarget): boolean {
    const entry = this.entries.get(terminalId);
    if (!entry) return false;
    entry.sender = sender;
    return true;
  }

  /** Detach the current output target (e.g. when its `webContents` is gone). */
  unbindSender(terminalId: TerminalId): void {
    const entry = this.entries.get(terminalId);
    if (entry) entry.sender = null;
  }

  /**
   * Replay the retained scrollback to the currently bound sender in one
   * `terminal:output` frame. This is the reattach primitive (mount / Cmd-R): the
   * caller binds the sender first, then replays so the fresh xterm shows prior output.
   * Pending (not-yet-flushed) bytes are folded into the replay and cleared to avoid
   * double-sending them on the next timer flush. No-op if no live sender is bound.
   */
  replayBuffer(terminalId: TerminalId): void {
    const entry = this.entries.get(terminalId);
    if (!entry || !entry.sender || entry.sender.isDestroyed()) return;
    if (entry.flushTimer !== null) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    // scrollback already contains the pending bytes (appended in handleData), so the
    // replay covers them — drop pending to prevent a duplicate flush.
    entry.pendingData = '';
    entry.pendingBytes = 0;
    if (entry.scrollback.length > 0) {
      entry.sender.send(TERMINAL_OUTPUT_CHANNEL, { terminalId, data: entry.scrollback });
    }
  }

  /** Kill and remove a single terminal. */
  dispose(terminalId: TerminalId): void {
    const entry = this.entries.get(terminalId);
    if (!entry) return;
    this.destroyEntry(entry);
    this.entries.delete(terminalId);
  }

  /** Kill and remove every terminal belonging to a conversation (on delete). */
  disposeByConversation(conversationId: ConversationId): void {
    for (const [id, entry] of this.entries) {
      if (entry.conversationId !== conversationId) continue;
      this.destroyEntry(entry);
      this.entries.delete(id);
    }
  }

  /** Kill and remove every terminal (on app quit). */
  disposeAll(): void {
    for (const entry of this.entries.values()) {
      this.destroyEntry(entry);
    }
    this.entries.clear();
  }

  /** Number of live entries — used by tests and diagnostics. */
  get size(): number {
    return this.entries.size;
  }

  private handleData(entry: PtyEntry, data: string): void {
    // Always retain output in the ring buffer so reattach can replay scrollback,
    // even while no renderer sink is bound.
    entry.scrollback += data;
    if (entry.scrollback.length > SCROLLBACK_CAP_CHARS) {
      entry.scrollback = entry.scrollback.slice(entry.scrollback.length - SCROLLBACK_CAP_CHARS);
    }

    entry.pendingData += data;
    entry.pendingBytes += Buffer.byteLength(data, 'utf8');

    if (entry.pendingBytes >= FLUSH_MAX_BYTES) {
      this.flush(entry);
      return;
    }
    if (entry.flushTimer === null) {
      entry.flushTimer = setTimeout(() => this.flush(entry), FLUSH_INTERVAL_MS);
    }
  }

  private flush(entry: PtyEntry): void {
    if (entry.flushTimer !== null) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    if (entry.pendingData.length === 0) return;

    const data = entry.pendingData;
    entry.pendingData = '';
    entry.pendingBytes = 0;

    // Skip the send when the bound renderer is gone; scrollback still holds the
    // bytes, so the next reattach replays them via replayBuffer.
    if (entry.sender && !entry.sender.isDestroyed()) {
      entry.sender.send(TERMINAL_OUTPUT_CHANNEL, { terminalId: entry.terminalId, data });
    }
  }

  private handleExit(entry: PtyEntry, event: { exitCode: number; signal?: number }): void {
    entry.status = 'exited';
    // Flush any tail output so the exit banner follows the last bytes.
    this.flush(entry);

    const exitEvent: TerminalExitEvent = {
      terminalId: entry.terminalId,
      conversationId: entry.conversationId,
      exitCode: event.exitCode,
      signal: event.signal,
    };
    // Low-rate event over the typed bridge. Do NOT auto-dispose — the renderer
    // shows an inline "process exited" banner with a Restart affordance.
    this.emitExit(exitEvent);
  }

  private destroyEntry(entry: PtyEntry): void {
    if (entry.flushTimer !== null) {
      clearTimeout(entry.flushTimer);
      entry.flushTimer = null;
    }
    entry.sender = null;
    safe(() => entry.dataDisposable.dispose());
    safe(() => entry.exitDisposable.dispose());
    if (entry.status === 'running') {
      safe(() => entry.pty.kill());
      entry.status = 'exited';
    }
  }

  private toInfo(entry: PtyEntry): TerminalInfo {
    return {
      terminalId: entry.terminalId,
      conversationId: entry.conversationId,
      cwd: entry.cwd,
      pid: entry.pid,
      status: entry.status,
      cols: entry.cols,
      rows: entry.rows,
    };
  }

  /** Inherit the user's env, dropping unset keys and forcing a sane TERM for ANSI. */
  private buildEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value;
    }
    env.TERM = 'xterm-256color';
    return env;
  }
}

/** Run a cleanup step, swallowing errors so one failure can't abort the rest. */
function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* best-effort cleanup */
  }
}
