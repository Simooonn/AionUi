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
import { extractTextItems, pickTitle } from './sessionTitle';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

function parseSessionFile(filePath: string): CliSessionMeta | null {
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
    if (o.type === 'user' && o.message && typeof o.message === 'object') {
      titleCandidates.push(...extractTextItems((o.message as { content?: unknown }).content));
    }
  }

  // A file with no parseable record at all is not a session.
  if (firstTs === undefined && !titleCandidates.length && !cwd) return null;

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
