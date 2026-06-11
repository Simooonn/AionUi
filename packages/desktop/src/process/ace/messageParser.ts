/**
 * Parse the message history of one CLI session into renderable items.
 * Metadata-only fields (tool_use/tool_result) are skipped in this version.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import type { CliSource, ParsedCliItem, ParsedCliMessage } from '@/common/ace/types';

const CLAUDE_PROJECTS = join(homedir(), '.claude', 'projects');
const CODEX_DIR = join(homedir(), '.codex');

function safeReaddir(d: string): string[] {
  try {
    return readdirSync(d);
  } catch {
    return [];
  }
}

function walkFind(dir: string, match: (name: string) => boolean): string | null {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    if (!d) continue;
    for (const e of safeReaddir(d)) {
      const p = join(d, e);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) stack.push(p);
      else if (match(e)) return p;
    }
  }
  return null;
}

function findClaudeFile(sessionId: string): string | null {
  if (!existsSync(CLAUDE_PROJECTS)) return null;
  for (const proj of safeReaddir(CLAUDE_PROJECTS)) {
    const p = join(CLAUDE_PROJECTS, proj, sessionId + '.jsonl');
    // Containment guard: sessionId comes from DB extra; join() would normalize
    // a crafted '../' sequence outside the projects dir.
    if (!p.startsWith(CLAUDE_PROJECTS + sep)) return null;
    if (existsSync(p)) return p;
  }
  return null;
}

function findCodexFile(sessionId: string): string | null {
  for (const sub of ['sessions', 'archived_sessions']) {
    const found = walkFind(
      join(CODEX_DIR, sub),
      (name) => name.startsWith('rollout-') && name.endsWith('.jsonl') && name.includes(sessionId)
    );
    if (found) return found;
  }
  return null;
}

function nonEmptyText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function tsMs(v: unknown): number | undefined {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : undefined;
  return undefined;
}

function readLines(filePath: string): Record<string, unknown>[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function itemsFromClaudeContent(content: unknown): ParsedCliItem[] {
  const items: ParsedCliItem[] = [];
  if (typeof content === 'string') {
    const t = nonEmptyText(content);
    if (t) items.push({ kind: 'text', text: t });
    return items;
  }
  if (!Array.isArray(content)) return items;
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as { type?: string; text?: unknown; thinking?: unknown };
    if (it.type === 'text') {
      const t = nonEmptyText(it.text);
      if (t) items.push({ kind: 'text', text: t });
    } else if (it.type === 'thinking') {
      const t = nonEmptyText(it.thinking);
      if (t) items.push({ kind: 'thinking', text: t });
    }
    // tool_use / tool_result skipped in this version
  }
  return items;
}

function parseClaude(filePath: string): ParsedCliMessage[] {
  const out: ParsedCliMessage[] = [];
  for (const o of readLines(filePath)) {
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    const message = o.message as { role?: string; content?: unknown } | undefined;
    if (!message) continue;
    const role = message.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const items = itemsFromClaudeContent(message.content);
    if (!items.length) continue;
    out.push({ msgId: String(o.uuid ?? ''), role, createdAt: tsMs(o.timestamp), items });
  }
  return out;
}

function parseCodex(filePath: string, sessionId: string): ParsedCliMessage[] {
  const out: ParsedCliMessage[] = [];
  let idx = 0;
  for (const o of readLines(filePath)) {
    const payload = (o.payload && typeof o.payload === 'object' ? o.payload : o) as {
      role?: string;
      content?: unknown;
    };
    const role = payload.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const items: ParsedCliItem[] = [];
    const content = payload.content;
    if (Array.isArray(content)) {
      for (const raw of content) {
        if (!raw || typeof raw !== 'object') continue;
        const it = raw as { type?: string; text?: unknown };
        if (it.type === 'input_text' || it.type === 'output_text' || it.type === 'text') {
          const t = nonEmptyText(it.text);
          if (t) items.push({ kind: 'text', text: t });
        }
      }
    } else {
      const t = nonEmptyText(content);
      if (t) items.push({ kind: 'text', text: t });
    }
    if (!items.length) continue;
    // Codex records carry no stable per-record id, so the msgId is positional —
    // it relies on rollout files being append-only. The session id MUST be part
    // of the msgId: messages.id is a GLOBAL primary key, and a bare positional
    // id ('codex-0') collides across every imported Codex conversation, making
    // INSERT OR IGNORE silently drop all but the first conversation's history.
    out.push({ msgId: `codex-${sessionId}-${idx}`, role, createdAt: tsMs(o.timestamp), items });
    idx += 1;
  }
  return out;
}

/** Locate the on-disk CLI session file (jsonl / rollout), or null when deleted. */
export function findSessionFile(source: CliSource, sessionId: string): string | null {
  return source === 'claude-code' ? findClaudeFile(sessionId) : findCodexFile(sessionId);
}

/** Parse all messages of a CLI session, located by source + sessionId. */
export function parseSessionMessages(source: CliSource, sessionId: string): ParsedCliMessage[] {
  const file = findSessionFile(source, sessionId);
  if (!file) return [];
  return source === 'claude-code' ? parseClaude(file) : parseCodex(file, sessionId);
}
