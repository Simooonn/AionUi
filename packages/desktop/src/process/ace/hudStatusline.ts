/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reproduce the user's Claude Code HUD statusline for a conversation workspace.
 *
 * oh-my-claudecode's hooks cache the statusline stdin payload at
 * `<workspace>/.omc/state/hud-stdin-cache.json` while an aioncore (Claude
 * Code) session is active. Feeding that payload to the statusLine command
 * configured in `~/.claude/settings.json` reproduces the exact HUD the user
 * sees in a native CLI session, ANSI colors included.
 *
 * Both inputs are user-owned local files; absence of either simply means
 * "no statusline to show" (returns null, never throws).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HudStatuslineResult = { text: string } | null;

const EXEC_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/** Read the user's statusLine command from Claude Code settings, or null. */
function readStatuslineCommand(): string | null {
  try {
    const raw = fs.readFileSync(path.join(claudeConfigDir(), 'settings.json'), 'utf8');
    const settings = JSON.parse(raw) as { statusLine?: { type?: string; command?: string } };
    const line = settings.statusLine;
    if (line?.type === 'command' && typeof line.command === 'string' && line.command.trim()) {
      return line.command;
    }
  } catch {
    /* missing or unparsable settings → no statusline configured */
  }
  return null;
}

export async function readHudStatusline(workspace: string): Promise<HudStatuslineResult> {
  // Statusline commands are POSIX shell lines; not supported on Windows.
  if (!workspace || process.platform === 'win32') return null;

  let stdinPayload: string;
  try {
    stdinPayload = fs.readFileSync(path.join(workspace, '.omc', 'state', 'hud-stdin-cache.json'), 'utf8');
  } catch {
    return null; // workspace has no OMC HUD cache → nothing to show
  }

  const command = readStatuslineCommand();
  if (!command) return null;

  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: workspace,
      env: process.env,
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    let out = '';
    let settled = false;
    const finish = (result: HudStatuslineResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null);
    }, EXEC_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (out.length < MAX_OUTPUT_BYTES) out += chunk.toString('utf8');
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      const text = out.trimEnd();
      finish(code === 0 && text ? { text } : null);
    });
    // The command may exit before consuming stdin — don't crash on EPIPE.
    child.stdin.on('error', () => undefined);
    child.stdin.end(stdinPayload);
  });
}
