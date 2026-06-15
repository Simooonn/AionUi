/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The single binding point between {@link TerminalManager} and the native
 * `@lydell/node-pty` prebuilt module. Isolating the native import here keeps the
 * manager unit-testable with an injected fake spawner, and keeps the addon a leaf
 * dependency of exactly one module.
 *
 * Requires `@lydell/node-pty` (added as a direct desktop dependency in Step 1 of the
 * embedded-terminal plan) — kept external by `externalizeDepsPlugin` so the prebuilt
 * `.node` is loaded at runtime from `app.asar.unpacked`.
 */

import type { IPtyProcess, PtySpawnFn } from './types';

/** Build the production PTY spawner backed by `@lydell/node-pty`. */
export function createNodePtySpawn(): PtySpawnFn {
  // Lazy-require the native addon at spawn-build time (not module-eval) so merely
  // importing this file never loads the prebuilt `.node`. `@lydell/node-pty` is a real
  // external dependency, kept external by `externalizeDepsPlugin`, so this require
  // resolves from `app.asar.unpacked` at runtime and is bundler-safe (unlike a path
  // alias inside `require()`, which the bundler does not rewrite).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePty = require('@lydell/node-pty') as typeof import('@lydell/node-pty');
  return ({ file, args, cwd, env, cols, rows }): IPtyProcess => {
    const pty = nodePty.spawn(file, args, {
      name: 'xterm-256color',
      cwd,
      env,
      cols,
      rows,
      encoding: 'utf8',
    });
    // node-pty's IPty is structurally compatible with our IPtyProcess subset.
    return pty;
  };
}
