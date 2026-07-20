/**
 * Parse Codex CLI local sessions into AionUi conversation metadata.
 *
 * Default storage (no user override):
 *   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl
 *   ~/.codex/archived_sessions/rollout-<ts>-<uuid>.jsonl
 * First record is `session_meta` whose payload carries { id, cwd, timestamp }.
 * User turns are `response_item`/message records with content items of type
 * 'input_text'. We only read metadata, never import messages.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { CliSessionMeta } from '@/common/ace/types';
import { cleanTitle, extractTextItems, isUsableTitle } from './sessionTitle';

const CODEX_DIR = join(homedir(), '.codex');
const SESSION_SUBDIRS = ['sessions', 'archived_sessions'];
const MAX_SCAN_LINES = 400;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/**
 * Codex Desktop spawns fork/subagent threads with new UUIDs that often inherit
 * the parent thread's first user prompt as the title. Importing them floods the
 * sidebar with look-alike duplicates. Only root user threads should import.
 */
export function isDerivedCodexThread(payload: Record<string, unknown>): boolean {
  if (typeof payload.parent_thread_id === 'string' && payload.parent_thread_id.length > 0) {
    return true;
  }
  if (typeof payload.forked_from_id === 'string' && payload.forked_from_id.length > 0) {
    return true;
  }
  if (payload.thread_source === 'subagent') {
    return true;
  }
  const source = payload.source;
  if (source && typeof source === 'object' && source !== null && 'subagent' in source) {
    return true;
  }
  return false;
}

function collectRolloutFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    if (!d) continue;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) stack.push(p);
      else if (e.startsWith('rollout-') && e.endsWith('.jsonl')) out.push(p);
    }
  }
  return out;
}

/** Exported for unit tests — skip fork/subagent rollouts. */
export function parseRolloutFile(filePath: string): CliSessionMeta | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  let sessionId: string | undefined;
  let cwd: string | undefined;
  let createdAt: number | undefined;
  let title: string | undefined;

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length && i < MAX_SCAN_LINES; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const payload = (o.payload && typeof o.payload === 'object' ? o.payload : o) as Record<string, unknown>;
    if (o.type === 'session_meta') {
      // Drop Codex Desktop fork / subagent threads — they share parent titles.
      if (isDerivedCodexThread(payload)) {
        return null;
      }
      if (!sessionId && typeof payload.id === 'string') sessionId = payload.id;
      if (!cwd && typeof payload.cwd === 'string') cwd = payload.cwd;
      if (createdAt === undefined && typeof payload.timestamp === 'string') {
        const t = Date.parse(payload.timestamp);
        if (!Number.isNaN(t)) createdAt = t;
      }
    }
    if (!title && payload.role === 'user') {
      for (const text of extractTextItems(payload.content)) {
        if (isUsableTitle(text)) {
          title = cleanTitle(text);
          break;
        }
      }
    }
    if (title && sessionId && cwd) break;
  }

  if (!sessionId) {
    const m = basename(filePath).match(UUID_RE);
    sessionId = m ? m[0] : basename(filePath, '.jsonl');
  }

  let updatedAt: number | undefined;
  try {
    // mtimeMs is a FLOAT — round at the source: this value flows into
    // extra.cli_updated_at and from there into sqlite INTEGER columns, where a
    // REAL breaks aioncore's i64 row deserialization (whole-list 500).
    updatedAt = Math.round(statSync(filePath).mtimeMs);
  } catch {
    updatedAt = undefined;
  }

  return {
    source: 'codex',
    sessionId,
    backend: 'codex',
    title: title ?? (cwd ? basename(cwd) : sessionId),
    workspace: cwd,
    createdAt: createdAt ?? updatedAt,
    updatedAt,
  };
}

/** Scan default Codex session dirs (sessions + archived_sessions), dedup by session id. */
export function parseCodexSessions(): CliSessionMeta[] {
  const seen = new Set<string>();
  const out: CliSessionMeta[] = [];
  for (const sub of SESSION_SUBDIRS) {
    const dir = join(CODEX_DIR, sub);
    if (!existsSync(dir)) continue;
    for (const file of collectRolloutFiles(dir)) {
      const meta = parseRolloutFile(file);
      if (meta && !seen.has(meta.sessionId)) {
        seen.add(meta.sessionId);
        out.push(meta);
      }
    }
  }
  return out;
}
