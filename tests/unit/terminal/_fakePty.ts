/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared test doubles for the embedded-terminal main-process tests.
 *
 * TerminalManager injects its PTY spawner (`PtySpawnFn`) and exit emitter via
 * constructor deps, so tests need neither the native `@lydell/node-pty` addon
 * nor Electron — they inject `createSpawnSpy()` here and drive output/exit
 * through the returned fake PTYs.
 *
 * `FakePty` mirrors the `IPtyProcess` subset the manager relies on
 * (pid / onData / onExit / write / resize / kill), records writes/resizes/kill,
 * and exposes `__emitData` / `__emitExit` driver helpers.
 */

import type { IPtyDisposable, IPtyProcess, PtySpawnFn, PtySpawnOptions } from '@/process/terminal/types';

export interface FakePty extends IPtyProcess {
  /** Recorded `write()` payloads, in order. */
  writes: string[];
  /** Recorded `resize(cols, rows)` calls, in order. */
  resizes: Array<{ cols: number; rows: number }>;
  /** True once `kill()` has been called. */
  killed: boolean;
  /** Last signal passed to `kill()`, if any. */
  killSignal?: string;
  /** Push a chunk to all data subscribers. */
  __emitData: (chunk: string) => void;
  /** Fire the exit subscribers with the given code/signal. */
  __emitExit: (exitCode: number, signal?: number) => void;
  /** Number of currently-registered data subscribers (0 after dispose). */
  __dataListenerCount: () => number;
  /** Number of currently-registered exit subscribers. */
  __exitListenerCount: () => number;
}

let nextPid = 1000;

/** Create a single fake IPty instance. */
export function createFakePty(pid = nextPid++): FakePty {
  const dataSubs = new Set<(data: string) => void>();
  const exitSubs = new Set<(e: { exitCode: number; signal?: number }) => void>();

  const pty: FakePty = {
    pid,
    writes: [],
    resizes: [],
    killed: false,
    killSignal: undefined,

    onData(listener): IPtyDisposable {
      dataSubs.add(listener);
      return { dispose: () => dataSubs.delete(listener) };
    },
    onExit(listener): IPtyDisposable {
      exitSubs.add(listener);
      return { dispose: () => exitSubs.delete(listener) };
    },
    write(data) {
      pty.writes.push(data);
    },
    resize(cols, rows) {
      pty.resizes.push({ cols, rows });
    },
    kill(signal) {
      pty.killed = true;
      pty.killSignal = signal;
    },

    __emitData(chunk) {
      for (const cb of dataSubs) cb(chunk);
    },
    __emitExit(exitCode, signal) {
      for (const cb of exitSubs) cb({ exitCode, signal });
    },
    __dataListenerCount: () => dataSubs.size,
    __exitListenerCount: () => exitSubs.size,
  };

  return pty;
}

export interface SpawnSpy {
  /** The injectable `PtySpawnFn` — pass as `deps.spawn`. */
  fn: PtySpawnFn;
  /** Every fake PTY produced, in spawn order. */
  instances: FakePty[];
  /** The options of every spawn() call, in order. */
  calls: PtySpawnOptions[];
  /** Options of the most recent spawn() call. */
  readonly last: PtySpawnOptions | undefined;
  /** The most recently spawned fake PTY. */
  readonly lastPty: FakePty | undefined;
}

/**
 * Build a spawn spy matching `PtySpawnFn`. Each call records its options and
 * returns a fresh {@link FakePty} so tests can drive that terminal's I/O.
 */
export function createSpawnSpy(): SpawnSpy {
  const instances: FakePty[] = [];
  const calls: PtySpawnOptions[] = [];

  const fn: PtySpawnFn = (options) => {
    calls.push(options);
    const pty = createFakePty();
    instances.push(pty);
    return pty;
  };

  return {
    fn,
    instances,
    calls,
    get last() {
      return calls[calls.length - 1];
    },
    get lastPty() {
      return instances[instances.length - 1];
    },
  };
}
