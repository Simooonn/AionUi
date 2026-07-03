/**
 * Parse Claude Code CLI local sessions into AionUi conversation metadata.
 *
 * Default storage (no user override): ~/.claude/projects/<cwd-slug>/<sessionId>.jsonl
 * Each .jsonl file is one session; records carry `sessionId`, `cwd`, `timestamp`,
 * and `message` ({ role, content }). We only read metadata, never import messages.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { CliSessionMeta } from '@/common/ace/types';
import { extractTextItems, isUsableTitle, pickTitle } from './sessionTitle';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// AionUi's own ACP conversations write their transcripts under ~/.claude/projects
// too (cwd = the app-support temp workspace or the .aionui work dir). Importing
// those would feed the app's own output back into it as "CLI history".
const AIONUI_INTERNAL_DIR_MARKERS = ['-Library-Application-Support-AionUi', '--aionui'];

/** True for project dirs produced by AionUi itself (excluded from import). */
export function isAionUiInternalProjectDir(dirName: string): boolean {
  return AIONUI_INTERNAL_DIR_MARKERS.some((marker) => dirName.includes(marker));
}

export function parseSessionFile(filePath: string): CliSessionMeta | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const sessionId = basename(filePath, '.jsonl');
  let cwd: string | undefined;
  let firstTs: number | undefined;
  let lastTs: number | undefined;
  let hasAssistantTurn = false;
  let hasRealUserPrompt = false;
  const titleCandidates: string[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!cwd && typeof o.cwd === 'string') cwd = o.cwd;
    if (typeof o.timestamp === 'string') {
      const t = Date.parse(o.timestamp);
      if (!Number.isNaN(t)) {
        if (firstTs === undefined) firstTs = t;
        lastTs = t;
      }
    }
    if (o.type === 'assistant') hasAssistantTurn = true;
    if (o.type === 'user' && o.message && typeof o.message === 'object') {
      const items = extractTextItems((o.message as { content?: unknown }).content);
      titleCandidates.push(...items);
      // Slash-command records ("<local-command-caveat>…", "<command-name>…") and
      // injected context all start with markers isUsableTitle rejects.
      if (!hasRealUserPrompt && items.some(isUsableTitle)) hasRealUserPrompt = true;
    }
  }

  // Only real interactive exchanges qualify. A `/clear` loop once left 42k
  // command-only session files in one project dir; importing those (or files
  // with no assistant reply at all) floods the conversation list with noise.
  if (!hasAssistantTurn || !hasRealUserPrompt) return null;

  const title = pickTitle(titleCandidates, cwd ? basename(cwd) : sessionId);
  return {
    source: 'claude-code',
    sessionId,
    backend: 'claude',
    title,
    workspace: cwd,
    createdAt: firstTs,
    updatedAt: lastTs,
  };
}

/** Scan the default Claude Code projects dir and return one meta per session file. */
export function parseClaudeCodeSessions(): CliSessionMeta[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return [];
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return [];
  }

  const out: CliSessionMeta[] = [];
  for (const proj of projectDirs) {
    if (isAionUiInternalProjectDir(proj)) continue;
    const projPath = join(CLAUDE_PROJECTS_DIR, proj);
    let files: string[];
    try {
      if (!statSync(projPath).isDirectory()) continue;
      files = readdirSync(projPath).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const meta = parseSessionFile(join(projPath, f));
      if (meta) out.push(meta);
    }
  }
  return out;
}
