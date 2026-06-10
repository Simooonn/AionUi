/**
 * Shared title-derivation helpers for CLI session parsers (Claude Code + Codex).
 */

const TITLE_MAX = 60;

// Both CLIs prepend system reminders / rule blocks / env-context to the first user
// turn; those are not meaningful titles.
const INJECTION_PREFIXES = ['<', '[', '#', 'Caveat:', 'Assistant Rules', 'System:', 'Files mentioned'];

/** Collect text strings from a message `content` (Claude uses 'text', Codex 'input_text'). */
export function extractTextItems(content: unknown): string[] {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const item of content) {
    if (item && typeof item === 'object') {
      const type = (item as { type?: string }).type;
      if (type === 'text' || type === 'input_text') {
        const text = (item as { text?: unknown }).text;
        if (typeof text === 'string') out.push(text);
      }
    }
  }
  return out;
}

export function isUsableTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return !INJECTION_PREFIXES.some((p) => t.startsWith(p));
}

export function cleanTitle(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

/** First usable text from ordered candidates, else the fallback. */
export function pickTitle(candidates: string[], fallback: string): string {
  for (const c of candidates) {
    if (isUsableTitle(c)) return cleanTitle(c);
  }
  return fallback;
}
