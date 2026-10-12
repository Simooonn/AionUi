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
 * already knows (workspace, transcript jsonl path, model, context window) and
 * pipe it through the same command — the HUD then renders THIS conversation's
 * own data (branch, session time, tool counts, ...).
 *
 * Two "no data" shapes, deliberately different:
 * - No conversation identity (no conversationId, or the transcript cannot be
 *   located): nothing is run and null is returned, so the renderer hides the
 *   whole bar. We never replay another session's payload.
 * - Transcript located but the context window is unknown (no reported window
 *   size, or no usable usage in the transcript tail): the payload is sent
 *   WITHOUT `context_window` and the ctx element is stripped from the output,
 *   so the HUD never shows a made-up percentage.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HudStatuslineParams, HudStatuslineResult } from '@/common/ace/types';

/** Resolve a conversation's transcript jsonl path; injectable for tests. */
export type HudStatuslineDeps = {
  resolveTranscript?: (conversationId: string) => Promise<string | null>;
};

const EXEC_TIMEOUT_MS = 3_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
// Usage entries appear on nearly every assistant turn, so the last one is
// always within a modest tail window even for very large transcripts.
const TRANSCRIPT_TAIL_BYTES = 256 * 1024;

// Inherited env vars that would MISLEAD the HUD script: session identity (e.g.
// `bun run dev` launched inside a claude session would make the script resolve
// the WRONG session/worktree) plus the terminal width (COLUMNS would make the
// script wrap/truncate for a tty we don't have; the GUI wraps on its own).
// CLAUDE_CONFIG_DIR must survive.
const LEAKY_SESSION_ENV = [
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_SESSION_ID',
  'CLAUDECODE_SESSION_ID',
  'OMC_STATE_DIR',
  'COLUMNS',
];

/**
 * Validate the raw IPC params. Returns null when there is no workspace to run
 * in. `contextLimit` only survives as a finite positive number — `0`, `NaN`,
 * `Infinity` and numeric strings all become undefined, which downstream means
 * "window size unknown" (no ctx element) rather than a bogus denominator.
 */
export function parseHudStatuslineParams(raw: unknown): HudStatuslineParams | null {
  const p = (raw ?? {}) as Partial<HudStatuslineParams>;
  if (typeof p.workspace !== 'string' || !p.workspace) return null;
  return {
    workspace: p.workspace,
    conversationId: typeof p.conversationId === 'string' ? p.conversationId : undefined,
    modelId: typeof p.modelId === 'string' ? p.modelId : undefined,
    modelLabel: typeof p.modelLabel === 'string' ? p.modelLabel : undefined,
    contextLimit:
      typeof p.contextLimit === 'number' && Number.isFinite(p.contextLimit) && p.contextLimit > 0
        ? p.contextLimit
        : undefined,
  };
}

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

type ContextUsage = {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
};

type TranscriptEntry = {
  type?: string;
  isSidechain?: boolean;
  message?: { usage?: Partial<ContextUsage> };
};

const asTokens = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * Extract the last main-chain assistant `message.usage` from the transcript
 * tail and shape it as the statusline `context_window` block. The numerator
 * sums all FOUR fields (input + cache_creation + cache_read + output) — the
 * same formula aioncore reports as `used` for the sendbox tooltip. The
 * percentage is computed here and handed to the HUD as `used_percentage`, so
 * the HUD never has to guess the window size.
 *
 * `contextLimit` is the window size reported for this session; a non-finite or
 * non-positive value means "unknown" and yields undefined (no ctx element).
 */
function readContextWindow(
  transcriptPath: string,
  contextLimit: number
): { context_window_size: number; used_percentage: number; current_usage: ContextUsage } | undefined {
  if (!Number.isFinite(contextLimit) || contextLimit <= 0) return undefined;
  try {
    const size = fs.statSync(transcriptPath).size;
    const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES);
    const fd = fs.openSync(transcriptPath, 'r');
    let tail: string;
    try {
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      tail = buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
    const lines = tail.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry: TranscriptEntry;
      try {
        entry = JSON.parse(lines[i]) as TranscriptEntry;
      } catch {
        continue; // blank or tail-truncated line
      }
      // Sidechain (subagent) turns carry the SUBAGENT's context, not this
      // conversation's — only the main chain reflects the visible session.
      if (entry.type !== 'assistant' || entry.isSidechain === true || !entry.message?.usage) continue;
      const usage = entry.message.usage;
      const current_usage: ContextUsage = {
        input_tokens: asTokens(usage.input_tokens),
        cache_creation_input_tokens: asTokens(usage.cache_creation_input_tokens),
        cache_read_input_tokens: asTokens(usage.cache_read_input_tokens),
        output_tokens: asTokens(usage.output_tokens),
      };
      const total =
        current_usage.input_tokens +
        current_usage.cache_creation_input_tokens +
        current_usage.cache_read_input_tokens +
        current_usage.output_tokens;
      if (total <= 0) continue;
      return {
        context_window_size: contextLimit,
        used_percentage: (total / contextLimit) * 100,
        current_usage,
      };
    }
  } catch {
    /* unreadable transcript → no context block */
  }
  return undefined;
}

/**
 * Build the statusline stdin payload for a conversation.
 *
 * Returns null when the conversation IDENTITY cannot be resolved (no id, no
 * transcript, resolver threw) — the caller then shows nothing at all. Only the
 * resolver call is guarded: a failure while assembling the payload is a bug
 * and must surface instead of masquerading as "no conversation".
 *
 * `hasContext` is false when the transcript WAS located but the window size is
 * unknown or the tail has no usable main-chain usage; the payload then carries
 * no `context_window` and the caller strips the ctx element from the output.
 */
async function buildStdinPayload(
  params: HudStatuslineParams,
  deps: HudStatuslineDeps
): Promise<{ payload: string; hasContext: boolean } | null> {
  if (!params.conversationId) return null;
  const resolveTranscript = deps.resolveTranscript ?? resolveTranscriptFromDb;
  let transcriptPath: string | null;
  try {
    transcriptPath = await resolveTranscript(params.conversationId);
  } catch {
    return null;
  }
  if (!transcriptPath) return null;

  // Normalized window size; 0 means "unknown" for readContextWindow.
  const limit =
    typeof params.contextLimit === 'number' && Number.isFinite(params.contextLimit) && params.contextLimit > 0
      ? params.contextLimit
      : 0;
  const context_window = readContextWindow(transcriptPath, limit);
  return {
    payload: JSON.stringify({
      transcript_path: transcriptPath,
      cwd: params.workspace,
      workspace: { current_dir: params.workspace, project_dir: params.workspace },
      model:
        params.modelId || params.modelLabel
          ? { id: params.modelId, display_name: params.modelLabel || params.modelId }
          : undefined,
      context_window,
    }),
    hasContext: context_window !== undefined,
  };
}

// HUD elements are joined with dim(" | "); outside safe mode every space
// becomes a NBSP, which JS `\s` matches as well.
// eslint-disable-next-line no-control-regex
const SEPARATOR_RE = /((?:\x1b\[2m)?\s\|\s(?:\x1b\[0m)?)/;
// eslint-disable-next-line no-control-regex
const SGR_RE = /\x1b\[[0-9;]*m/g;
// A ctx element: `ctx`/`上下文` label, optional [bar], NN%, optional suffix.
const CTX_RE = /^(?:ctx|上下文):(?:\[[^\]]*\])?\d{1,3}%(?:\s(?:CRITICAL|COMPRESS\?))?$/;

const isContextSegment = (segment: string): boolean => CTX_RE.test(segment.replace(SGR_RE, '').trim());

/**
 * Remove the HUD's ctx element from a statusline output, used when no context
 * data was sent (the HUD would otherwise render a meaningless `ctx:0%`).
 *
 * Each line is split on the separator; a matching segment is dropped together
 * with one adjacent separator, so no dangling " | " is left behind. A line is
 * dropped only when REMOVING the ctx element emptied it — pre-existing blank
 * lines are part of the HUD's multi-line layout and stay. Returns '' when
 * nothing printable is left, which the caller turns into null.
 */
export function stripContextSegment(text: string): string {
  const keptLines: string[] = [];
  for (const line of text.split('\n')) {
    // Capturing split: [segment, separator, segment, separator, ...].
    const parts = line.split(SEPARATOR_RE);
    const out: string[] = [];
    let removed = false;
    for (let i = 0; i < parts.length; i += 2) {
      if (isContextSegment(parts[i])) {
        removed = true;
        continue;
      }
      // Re-attach the separator that preceded this segment, unless this is now
      // the first surviving segment (dropping it also drops its separator).
      if (out.length > 0) out.push(parts[i - 1]);
      out.push(parts[i]);
    }
    const rebuilt = out.join('');
    if (removed && !rebuilt.trim()) continue;
    keptLines.push(rebuilt);
  }
  const result = keptLines.join('\n');
  return result.trim() ? result : '';
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

  // Checked before touching the DB/transcript: machines without a statusLine
  // command (CI, no OMC installed) must not pay for the lookup every poll.
  const command = readStatuslineCommand();
  if (!command) return null;

  const built = await buildStdinPayload(params, deps);
  if (!built) return null;

  const result = await runStatuslineCommand(command, built.payload, params.workspace);
  if (!result) return null;
  if (built.hasContext) return result;

  const text = stripContextSegment(result.text);
  return text ? { text } : null;
}
