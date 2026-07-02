/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Produce the user's Claude Code HUD statusline for an ACP conversation.
 *
 * Native Claude Code CLI sessions feed a stdin JSON payload to the statusLine
 * command configured in `~/.claude/settings.json`. aioncore is headless and
 * never invokes that command, so we SYNTHESIZE the payload from what the app
 * already knows (workspace, transcript jsonl path, model) and pipe it through
 * the same command — the HUD then renders THIS conversation's own data
 * (branch, session time, tool counts, ...).
 *
 * When the conversation's transcript cannot be resolved we replay the
 * workspace's OMC stdin cache (`.omc/state/hud-stdin-cache.json`), which
 * exists where the user also runs the native CLI. Absence of both simply
 * means "no statusline to show" (returns null, never throws) — the renderer
 * hides the bar entirely.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type HudStatuslineParams = {
  workspace: string;
  conversationId?: string;
  modelId?: string;
  modelLabel?: string;
};

export type HudStatuslineResult = { text: string } | null;

/** Resolve a conversation's transcript jsonl path; injectable for tests. */
export type HudStatuslineDeps = {
  resolveTranscript?: (conversationId: string) => Promise<string | null>;
};

const EXEC_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// Session-identity env vars that could leak from a parent CLI session (e.g.
// `bun run dev` launched inside a claude session) and would make the HUD
// script resolve the WRONG session/worktree. CLAUDE_CONFIG_DIR must survive.
const LEAKY_SESSION_ENV = ['CLAUDE_PROJECT_DIR', 'CLAUDE_SESSION_ID', 'CLAUDECODE_SESSION_ID', 'OMC_STATE_DIR'];

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

/** Default transcript resolver, backed by the acp_session/conversations DB. */
async function resolveTranscriptFromDb(conversationId: string): Promise<string | null> {
  // Lazy import: sessionFiles pulls Electron-side storage helpers that must
  // not load in unit tests (tests inject their own resolver).
  const { resolveConversationFiles } = await import('./sessionFiles');
  const resolved = (await resolveConversationFiles([conversationId]))[conversationId];
  if (resolved?.kind === 'file' && resolved.path && fs.existsSync(resolved.path)) return resolved.path;
  return null;
}

/** Build the statusline stdin payload for a conversation, or null. */
async function buildStdinPayload(params: HudStatuslineParams, deps: HudStatuslineDeps): Promise<string | null> {
  if (!params.conversationId) return null;
  try {
    const resolveTranscript = deps.resolveTranscript ?? resolveTranscriptFromDb;
    const transcriptPath = await resolveTranscript(params.conversationId);
    if (!transcriptPath) return null;
    return JSON.stringify({
      transcript_path: transcriptPath,
      cwd: params.workspace,
      workspace: { current_dir: params.workspace, project_dir: params.workspace },
      model:
        params.modelId || params.modelLabel
          ? { id: params.modelId, display_name: params.modelLabel || params.modelId }
          : undefined,
    });
  } catch {
    return null;
  }
}

/** Read the workspace's OMC stdin cache (written by native-CLI sessions), or null. */
function readCachedPayload(workspace: string): string | null {
  try {
    return fs.readFileSync(path.join(workspace, '.omc', 'state', 'hud-stdin-cache.json'), 'utf8');
  } catch {
    return null;
  }
}

function runStatuslineCommand(command: string, stdinPayload: string, cwd: string): Promise<HudStatuslineResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of LEAKY_SESSION_ENV) delete env[key];

    const child = spawn('/bin/sh', ['-c', command], { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });

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

export async function readHudStatusline(
  params: HudStatuslineParams,
  deps: HudStatuslineDeps = {}
): Promise<HudStatuslineResult> {
  // Statusline commands are POSIX shell lines; not supported on Windows.
  if (!params.workspace || process.platform === 'win32') return null;

  const command = readStatuslineCommand();
  if (!command) return null;

  // Prefer the synthesized per-conversation payload (this conversation's own
  // data); the workspace's native-CLI cache covers conversations whose
  // transcript cannot be resolved (e.g. freshly created, imported formats).
  const payload = (await buildStdinPayload(params, deps)) ?? readCachedPayload(params.workspace);
  if (!payload) return null;

  return runStatuslineCommand(command, payload, params.workspace);
}
