/**
 * Parse the message history of one CLI session into renderable items.
 * Metadata-only fields (tool_use/tool_result) are skipped in this version.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import type { CliSource, ParsedCliItem, ParsedCliMessage } from '@/common/ace/types';
import { geminiTexts } from './parsers/geminiParser';
import { findOpencodeFiles, parseOpencodeMessages } from './parsers/opencodeParser';
import { boundedRawInput, capText, imageFromDataUrl, toolTitle } from './parsers/parseHelpers';

const CLAUDE_PROJECTS = join(homedir(), '.claude', 'projects');
const CODEX_DIR = join(homedir(), '.codex');
const GEMINI_TMP = join(homedir(), '.gemini', 'tmp');

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

// --- gemini locator -----------------------------------------------------------
// One logical session may span MULTIPLE chats files: ACP session/load CONTINUES
// a session in a NEW file carrying the SAME header sessionId (spike-verified,
// it does NOT append to the original file). The locator therefore returns every
// match and the parser merges them.

/** Header (line 1) sessionId of a candidate file, or null. */
function geminiHeaderSessionId(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, 'utf-8'); // session files are small (KBs)
    const nl = raw.indexOf('\n');
    const o = JSON.parse(nl === -1 ? raw : raw.slice(0, nl)) as { sessionId?: unknown };
    return typeof o.sessionId === 'string' ? o.sessionId : null;
  } catch {
    return null;
  }
}

/**
 * Header-aware traversal: the filename carries only the FIRST 8 HEX of the
 * session id, so every candidate's header must full-match — a mismatching
 * candidate is skipped and the walk continues (walkFind's first-match early
 * return cannot express that). Newest activity first.
 * `root` is parameterized for tests only; production always uses ~/.gemini/tmp.
 */
export function findGeminiFiles(sessionId: string, root: string = GEMINI_TMP): string[] {
  const prefix = sessionId.slice(0, 8);
  const matches: { p: string; m: number }[] = [];
  for (const dir of safeReaddir(root)) {
    const chats = join(root, dir, 'chats');
    for (const name of safeReaddir(chats)) {
      if (!name.startsWith('session-') || !name.endsWith('.jsonl') || !name.includes(prefix)) continue;
      const p = join(chats, name);
      if (geminiHeaderSessionId(p) !== sessionId) continue; // 8hex prefix collision → keep looking
      let m = 0;
      try {
        m = statSync(p).mtimeMs;
      } catch {
        /* unstatable → sort last */
      }
      matches.push({ p, m });
    }
  }
  return matches.sort((a, b) => b.m - a.m).map((x) => x.p);
}

function nonEmptyText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Concatenated raw text of a Claude content value (string or text items), trimmed. */
function rawTextOf(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((it): it is { type: string; text?: unknown } => Boolean(it) && typeof it === 'object')
    .filter((it) => it.type === 'text' && typeof it.text === 'string')
    .map((it) => it.text as string)
    .join('\n')
    .trim();
}

// --- harness-injection noise filtering --------------------------------------
// Both CLIs persist harness-injected records verbatim alongside real chat turns
// (slash-command frames, local-command output, env context, abort markers...).
// Rendered as-is they fill imported history with XML-looking garbage, so user
// records are cleaned/dropped here. Dropping shifts positional Codex ids, which
// is safe because the importer replace-syncs all cli- rows per conversation.

// Exact prefixes only — bracket/heading starts can also be REAL user text
// ('[Image #1] 看下这个'), so no blanket “starts with < or [” rule.
const CLAUDE_NOISE_PREFIXES = [
  '<local-command-stdout>',
  '<local-command-caveat>',
  '<task-notification>',
  'Caveat: The messages below',
  '[Assistant Rules]',
  '[Request interrupted', // covers '…by user]' and '…by user for tool use]'
];

const CODEX_NOISE_PREFIXES = [
  '<environment_context>',
  '<turn_aborted>',
  '<user_instructions>',
  '<image ', // image attachment frame items ('<image name=[Image #1]>' / '</image>')
  '</image>',
  '# AGENTS.md instructions', // pre-<user_instructions> plain-header injection
  '# Files mentioned by the user', // harness-expanded @-mention file contents
];

// Gemini injects a <session_context> seed as the first user record of every
// session (constant record id across sessions); like the codex precedent this
// gate applies to USER records only.
const GEMINI_NOISE_PREFIXES = ['<session_context>'];

/**
 * Clean one Claude Code user text item: slash-command frames become a compact
 * "/cmd args" line (the args are the user's real ask), pure injection records
 * are dropped (null), and appended <system-reminder> blocks are stripped.
 */
export function cleanClaudeUserText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('<command-')) {
    const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(trimmed)?.[1]?.trim();
    if (!name) return null;
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(trimmed)?.[1]?.trim();
    return args ? `${name} ${args}` : name;
  }
  if (CLAUDE_NOISE_PREFIXES.some((p) => trimmed.startsWith(p))) return null;
  const stripped = trimmed
    // Hooks append <system-reminder> blocks to real user turns — strip, keep the rest.
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    // Harness-inserted attachment placeholders; the image blocks themselves are
    // not imported, so '[Image #N]' alone reads as noise.
    .replace(/\[Image #\d+\]/g, '')
    .trim();
  return stripped || null;
}

/** True for Codex user records injected by the harness (not typed by the user). */
export function isCodexInjectedText(text: string): boolean {
  const trimmed = text.trim();
  return CODEX_NOISE_PREFIXES.some((p) => trimmed.startsWith(p));
}

/** True for Gemini user records injected by the harness (the <session_context> seed). */
export function isGeminiInjectedText(text: string): boolean {
  const trimmed = text.trim();
  return GEMINI_NOISE_PREFIXES.some((p) => trimmed.startsWith(p));
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

function itemsFromClaudeContent(
  content: unknown,
  role: 'user' | 'assistant',
  pendingTools: Map<string, ToolItem>
): ParsedCliItem[] {
  const items: ParsedCliItem[] = [];
  const pushText = (raw: string | null) => {
    if (raw === null) return;
    // Injection records only ever appear as user turns; assistant text is kept
    // verbatim (it may legitimately quote tag-like markup).
    const t = role === 'user' ? cleanClaudeUserText(raw) : raw;
    if (t) items.push({ kind: 'text', text: t });
  };
  if (typeof content === 'string') {
    pushText(nonEmptyText(content));
    return items;
  }
  if (!Array.isArray(content)) return items;
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as {
      type?: string;
      text?: unknown;
      thinking?: unknown;
      source?: { type?: string; media_type?: string; data?: string };
      id?: unknown;
      name?: unknown;
      input?: unknown;
      tool_use_id?: unknown;
      content?: unknown;
      is_error?: unknown;
    };
    if (it.type === 'text') {
      pushText(nonEmptyText(it.text));
    } else if (it.type === 'thinking') {
      const t = nonEmptyText(it.thinking);
      if (t) items.push({ kind: 'thinking', text: t });
    } else if (it.type === 'image' && it.source?.type === 'base64' && it.source.data) {
      items.push({ kind: 'image', mediaType: it.source.media_type ?? 'image/png', dataBase64: it.source.data });
    } else if (it.type === 'tool_use' && typeof it.id === 'string' && typeof it.name === 'string') {
      const tool: ToolItem = {
        kind: 'tool',
        callId: it.id,
        name: it.name,
        title: toolTitle(it.name, it.input),
        toolKind: claudeToolKind(it.name),
        status: 'completed',
        rawInput: boundedRawInput(it.input),
      };
      items.push(tool);
      pendingTools.set(it.id, tool);
    } else if (it.type === 'tool_result' && typeof it.tool_use_id === 'string') {
      // Results arrive in the NEXT (user) record; mutate the pending tool item
      // in place — rows are built from items only after the whole parse pass.
      const tool = pendingTools.get(it.tool_use_id);
      if (tool) {
        tool.output = toolResultText(it.content);
        if (it.is_error === true) tool.status = 'failed';
      }
    }
  }
  return items;
}

// --- tool-call extraction ----------------------------------------------------
// Tool executions become `tool` items, later written as acp_tool_call rows in
// the exact shape aioncore persists for live turns — the app's existing
// compact tool-row UI (and tool grouping) renders them with zero new UI code.
// toolTitle/capText/boundedRawInput/imageFromDataUrl live in parsers/parseHelpers
// (shared with the opencode parser without a circular import).

/** ACP tool-call kind for a Claude Code tool name (drives the row icon). */
function claudeToolKind(name: string): string {
  if (name === 'Read' || name === 'NotebookRead') return 'read';
  if (name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'NotebookEdit') return 'edit';
  if (name === 'Bash' || name === 'Skill') return 'execute';
  if (name === 'Grep' || name === 'Glob') return 'search';
  if (name === 'WebFetch' || name === 'WebSearch') return 'fetch';
  return 'other';
}

/** Text form of a Claude tool_result content (string or content-item array). */
function toolResultText(content: unknown): string | undefined {
  if (typeof content === 'string') return content.trim() ? capText(content) : undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((it): it is { type?: string; text?: unknown } => Boolean(it) && typeof it === 'object')
    .filter((it) => it.type === 'text' && typeof it.text === 'string')
    .map((it) => it.text as string)
    .join('\n')
    .trim();
  return text ? capText(text) : undefined;
}

type ToolItem = Extract<ParsedCliItem, { kind: 'tool' }>;

function parseClaude(filePath: string): ParsedCliMessage[] {
  const out: ParsedCliMessage[] = [];
  const pendingTools = new Map<string, ToolItem>();
  for (const o of readLines(filePath)) {
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    // isMeta marks harness-generated records (skill payload injections,
    // "Continue from where you left off." continuations) — never shown by the
    // CLI's own UI either.
    if (o.isMeta === true) continue;
    const message = o.message as { role?: string; content?: unknown } | undefined;
    if (!message) continue;
    const role = message.role;
    if (role !== 'user' && role !== 'assistant') continue;
    // The post-/compact wall of text ("This session is being continued from a
    // previous conversation…") becomes a dedicated collapsed-by-default item
    // instead of a regular bubble. Raw text on purpose: cleanClaudeUserText
    // would mangle the summary body.
    if (o.isCompactSummary === true) {
      const t = rawTextOf(message.content);
      if (t) {
        out.push({
          msgId: String(o.uuid ?? ''),
          role,
          createdAt: tsMs(o.timestamp),
          items: [{ kind: 'compact-summary', text: t }],
        });
      }
      continue;
    }
    const items = itemsFromClaudeContent(message.content, role, pendingTools);
    if (!items.length) continue;
    out.push({ msgId: String(o.uuid ?? ''), role, createdAt: tsMs(o.timestamp), items });
  }
  return out;
}

function parseCodex(filePath: string, sessionId: string): ParsedCliMessage[] {
  const out: ParsedCliMessage[] = [];
  const pendingTools = new Map<string, ToolItem>();
  let idx = 0;
  const push = (o: Record<string, unknown>, items: ParsedCliItem[], role: 'user' | 'assistant') => {
    out.push({ msgId: `codex-${sessionId}-${idx}`, role, createdAt: tsMs(o.timestamp), items });
    idx += 1;
  };
  for (const o of readLines(filePath)) {
    const payload = (o.payload && typeof o.payload === 'object' ? o.payload : o) as {
      role?: string;
      content?: unknown;
      type?: string;
      name?: unknown;
      arguments?: unknown;
      call_id?: unknown;
      output?: unknown;
    };
    // Tool executions (no role on these records).
    if (payload.type === 'function_call' && typeof payload.call_id === 'string' && typeof payload.name === 'string') {
      let args: unknown;
      try {
        args = typeof payload.arguments === 'string' ? JSON.parse(payload.arguments) : payload.arguments;
      } catch {
        args = undefined;
      }
      const tool: ToolItem = {
        kind: 'tool',
        callId: payload.call_id,
        name: payload.name,
        title: toolTitle(payload.name, args),
        toolKind: 'execute',
        status: 'completed',
        rawInput: boundedRawInput(args),
      };
      pendingTools.set(payload.call_id, tool);
      push(o, [tool], 'assistant');
      continue;
    }
    if (payload.type === 'function_call_output' && typeof payload.call_id === 'string') {
      const tool = pendingTools.get(payload.call_id);
      if (tool && typeof payload.output === 'string' && payload.output.trim()) {
        tool.output = capText(payload.output);
        // exec_command outputs state the exit code in a stable header line.
        if (/^Process exited with code (?!0\b)\d+/m.test(payload.output)) tool.status = 'failed';
      }
      continue;
    }
    const role = payload.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const items: ParsedCliItem[] = [];
    const content = payload.content;
    if (Array.isArray(content)) {
      for (const raw of content) {
        if (!raw || typeof raw !== 'object') continue;
        const it = raw as { type?: string; text?: unknown; image_url?: unknown };
        if (it.type === 'input_text' || it.type === 'output_text' || it.type === 'text') {
          const t = nonEmptyText(it.text);
          if (t && !(role === 'user' && isCodexInjectedText(t))) items.push({ kind: 'text', text: t });
        } else if (it.type === 'input_image') {
          const img = imageFromDataUrl(it.image_url);
          if (img) items.push({ kind: 'image', ...img });
        }
      }
    } else {
      const t = nonEmptyText(content);
      if (t && !(role === 'user' && isCodexInjectedText(t))) items.push({ kind: 'text', text: t });
    }
    if (!items.length) continue;
    // Codex records carry no stable per-record id, so the msgId is positional.
    // The session id MUST be part of the msgId: messages.id is a GLOBAL primary
    // key, and a bare positional id ('codex-0') collides across every imported
    // Codex conversation. Positional drift (append-only violations, filter
    // changes) is tolerated because the importer replace-syncs cli- rows.
    push(o, items, role);
  }
  return out;
}

// --- gemini parser (Option A1: dual-channel merge) ----------------------------

type GeminiRecord = { id?: unknown; timestamp?: unknown; type?: unknown; content?: unknown };

const GEMINI_TYPED = new Set(['user', 'gemini', 'error', 'info', 'warning']);

/**
 * Collect one file's records from BOTH channels: the LAST $set.messages
 * snapshot (the authoritative replayed state of the event-sourced log) plus
 * the top-level typed records, deduped by record id. Today's data routes all
 * real content through typed records; the snapshot channel is deliberate
 * drift-insurance (see plan ADR) AND carries resumed sessions' seed records.
 */
function collectGeminiRecords(filePath: string, seen: Set<string>, order: GeminiRecord[]): void {
  let snapshot: GeminiRecord[] | null = null;
  const typed: GeminiRecord[] = [];
  for (const o of readLines(filePath)) {
    const patch = (o as { $set?: Record<string, unknown> }).$set;
    if (patch && typeof patch === 'object') {
      if (Array.isArray(patch.messages)) snapshot = patch.messages as GeminiRecord[];
      continue;
    }
    if (typeof o.type === 'string' && GEMINI_TYPED.has(o.type)) typed.push(o as GeminiRecord);
  }
  for (const rec of [...(snapshot ?? []), ...typed]) {
    const id = typeof rec.id === 'string' && rec.id ? rec.id : `${filePath}#${order.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(rec);
  }
}

/** Parse + merge ALL files of one gemini session (continuation files included). */
function parseGeminiFiles(filePaths: string[], sessionId: string): ParsedCliMessage[] {
  const seen = new Set<string>();
  const order: GeminiRecord[] = [];
  // Oldest file first so insertion order approximates conversation order;
  // the timestamp sort below is the authority.
  for (const f of [...filePaths].reverse()) collectGeminiRecords(f, seen, order);

  const out: ParsedCliMessage[] = [];
  for (const rec of order) {
    const items: ParsedCliItem[] = [];
    if (rec.type === 'user') {
      for (const t of geminiTexts(rec.content)) {
        if (t.trim() && !isGeminiInjectedText(t)) items.push({ kind: 'text', text: t });
      }
    } else if (rec.type === 'gemini') {
      const t = nonEmptyText(rec.content);
      if (t) items.push({ kind: 'text', text: t });
    } else if (rec.type === 'error' || rec.type === 'info' || rec.type === 'warning') {
      const t = nonEmptyText(rec.content);
      if (t) items.push({ kind: 'tip', tipType: rec.type, text: t });
    }
    // anything else (functionResponse-only user records, unknown types) is skipped
    if (!items.length) continue;
    const msgId = typeof rec.id === 'string' && rec.id ? `gem-${rec.id}` : `gem-${sessionId}-${out.length}`;
    out.push({ msgId, role: rec.type === 'user' ? 'user' : 'assistant', createdAt: tsMs(rec.timestamp), items });
  }
  // Cross-file merge can interleave records; order by timestamp, original
  // insertion order as the tiebreaker (and for records without timestamps).
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) =>
      a.m.createdAt !== undefined && b.m.createdAt !== undefined && a.m.createdAt !== b.m.createdAt
        ? a.m.createdAt - b.m.createdAt
        : a.i - b.i
    )
    .map((x) => x.m);
}

/** Locate the primary on-disk CLI session file, or null when deleted.
 * For opencode the "file" is the SHARED DB (existence gate only — never a
 * deletion target; see findOpencodeFiles). */
export function findSessionFile(source: CliSource, sessionId: string): string | null {
  if (source === 'gemini') return findGeminiFiles(sessionId)[0] ?? null;
  if (source === 'opencode') return findOpencodeFiles(sessionId)[0] ?? null;
  return source === 'claude-code' ? findClaudeFile(sessionId) : findCodexFile(sessionId);
}

/** Every on-disk file of one CLI session (gemini sessions may span several). */
export function findSessionFiles(source: CliSource, sessionId: string): string[] {
  if (source === 'gemini') return findGeminiFiles(sessionId);
  if (source === 'opencode') return findOpencodeFiles(sessionId);
  const f = findSessionFile(source, sessionId);
  return f ? [f] : [];
}

/** Parse all messages of an already-located CLI session file. */
export function parseSessionFile(source: CliSource, filePath: string, sessionId: string): ParsedCliMessage[] {
  return parseSessionFiles(source, [filePath], sessionId);
}

/** Parse all messages of one CLI session across its located files. */
export function parseSessionFiles(source: CliSource, filePaths: string[], sessionId: string): ParsedCliMessage[] {
  if (!filePaths.length) return [];
  if (source === 'gemini') return parseGeminiFiles(filePaths, sessionId);
  // opencode reads the shared DB directly; filePaths is just the existence gate.
  if (source === 'opencode') return parseOpencodeMessages(sessionId);
  return source === 'claude-code' ? parseClaude(filePaths[0]) : parseCodex(filePaths[0], sessionId);
}

/** Parse all messages of a CLI session, located by source + sessionId. */
export function parseSessionMessages(source: CliSource, sessionId: string): ParsedCliMessage[] {
  return parseSessionFiles(source, findSessionFiles(source, sessionId), sessionId);
}
