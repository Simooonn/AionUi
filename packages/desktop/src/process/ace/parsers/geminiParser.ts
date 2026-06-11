/**
 * Parse Gemini CLI local sessions into AionUi conversation metadata.
 *
 * Storage: ~/.gemini/tmp/<dirName>/chats/session-<timestamp>-<8hex>.jsonl
 * Line 1 is a header {sessionId, projectHash, startTime, lastUpdated, kind};
 * the body is EVENT-SOURCED: {$set:{...}} patches (messages snapshots,
 * lastUpdated bumps) interleaved with typed records {id, timestamp, type,
 * content}. The header's lastUpdated is only the INITIAL state — the real
 * last activity is the final $set.lastUpdated after replay.
 *
 * Workspace recovery: ~/.gemini/projects.json maps realPath → dirName, and
 * the header projectHash is sha256(rawRealPathKey) — hash every key and match
 * (dirName itself is a non-unique slug and must NOT be the anchor).
 *
 * ONE SESSION MAY SPAN MULTIPLE FILES (resume spike evidence): ACP
 * session/load CONTINUES the session in a NEW chats file carrying the SAME
 * header sessionId instead of appending to the original. The scanner must
 * therefore group per sessionId — one CliSessionMeta per session, not per file.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliSessionMeta } from '@/common/ace/types';
import { pickTitle } from './sessionTitle';

const GEMINI_TMP_DIR = join(homedir(), '.gemini', 'tmp');
const GEMINI_PROJECTS_JSON = join(homedir(), '.gemini', 'projects.json');

/** Build sha256(rawRealPathKey) → realPath from projects.json (keys nest under `projects`). */
export function loadGeminiProjectHashMap(projectsJsonPath: string = GEMINI_PROJECTS_JSON): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const o = JSON.parse(readFileSync(projectsJsonPath, 'utf-8')) as { projects?: Record<string, string> };
    // Hash the RAW key string — no normalize, no trailing-slash strip ('/' as-is).
    for (const realPath of Object.keys(o.projects ?? {})) {
      map.set(createHash('sha256').update(realPath).digest('hex'), realPath);
    }
  } catch {
    /* missing/corrupt projects.json → workspace resolution falls back downstream */
  }
  return map;
}

/** Gemini user content is [{text}] WITHOUT a type field — extractTextItems cannot read it. */
export function geminiTexts(content: unknown): string[] {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((it): it is { text?: unknown } => Boolean(it) && typeof it === 'object')
    .map((it) => it.text)
    .filter((t): t is string => typeof t === 'string');
}

type GeminiHeader = { sessionId?: string; projectHash?: string; startTime?: string; lastUpdated?: string };

function tsOf(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

/** Parse one session jsonl into meta, or null when it has no valid header. */
export function parseGeminiSessionFile(filePath: string, hashToPath: Map<string, string>): CliSessionMeta | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split('\n');
  let header: GeminiHeader | null = null;
  let lastUpdated: number | undefined;
  const titleCandidates: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!header && typeof o.sessionId === 'string') {
      header = o as GeminiHeader;
      lastUpdated = tsOf(header.lastUpdated);
      continue;
    }
    const patch = o.$set as Record<string, unknown> | undefined;
    if (patch && typeof patch === 'object') {
      // Event-sourced replay: the last $set.lastUpdated is the real last activity.
      const t = tsOf(patch.lastUpdated);
      if (t !== undefined) lastUpdated = t;
      if (Array.isArray(patch.messages)) {
        for (const m of patch.messages) {
          const rec = m as { type?: string; content?: unknown };
          if (rec?.type === 'user') titleCandidates.push(...geminiTexts(rec.content));
        }
      }
      continue;
    }
    if (o.type === 'user') titleCandidates.push(...geminiTexts(o.content));
  }

  if (!header?.sessionId) return null; // not a session file

  // pickTitle's injection-prefix filter ('<', '[', …) skips the <session_context> seed.
  const workspace = header.projectHash ? hashToPath.get(header.projectHash) : undefined;
  // Degenerate workspace keys ('/', '') have no last segment — fall back to the id.
  const fallback = (workspace ? workspace.split('/').filter(Boolean).pop() : undefined) ?? header.sessionId;
  const title = pickTitle(titleCandidates, fallback);
  return {
    source: 'gemini',
    sessionId: header.sessionId,
    backend: 'gemini',
    title,
    workspace,
    createdAt: tsOf(header.startTime),
    updatedAt: lastUpdated,
  };
}

/** Fold a continuation file's meta into the session's existing meta. */
function mergeSessionMeta(base: CliSessionMeta, next: CliSessionMeta): CliSessionMeta {
  const earliest =
    base.createdAt !== undefined && (next.createdAt === undefined || base.createdAt <= next.createdAt)
      ? base.createdAt
      : next.createdAt;
  const latest =
    base.updatedAt !== undefined && (next.updatedAt === undefined || base.updatedAt >= next.updatedAt)
      ? base.updatedAt
      : next.updatedAt;
  // The original (earliest) file holds the real first user turn → prefer the
  // earlier file's title unless it fell back to the sessionId.
  const baseIsEarlier = earliest === base.createdAt;
  const primary = baseIsEarlier ? base : next;
  const secondary = baseIsEarlier ? next : base;
  return {
    ...primary,
    title: primary.title === primary.sessionId ? secondary.title : primary.title,
    workspace: primary.workspace ?? secondary.workspace,
    createdAt: earliest,
    updatedAt: latest,
  };
}

/** Scan every ~/.gemini/tmp/<dir>/chats and return one meta per SESSION (id-grouped across files). */
export function parseGeminiSessions(): CliSessionMeta[] {
  if (!existsSync(GEMINI_TMP_DIR)) return [];
  let dirs: string[];
  try {
    dirs = readdirSync(GEMINI_TMP_DIR);
  } catch {
    return [];
  }
  const hashToPath = loadGeminiProjectHashMap();

  const bySession = new Map<string, CliSessionMeta>();
  for (const dir of dirs) {
    const chats = join(GEMINI_TMP_DIR, dir, 'chats');
    let files: string[];
    try {
      if (!statSync(chats).isDirectory()) continue;
      files = readdirSync(chats).filter((f) => f.startsWith('session-') && f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const meta = parseGeminiSessionFile(join(chats, f), hashToPath);
      if (!meta) continue;
      const prev = bySession.get(meta.sessionId);
      bySession.set(meta.sessionId, prev ? mergeSessionMeta(prev, meta) : meta);
    }
  }
  return [...bySession.values()];
}
