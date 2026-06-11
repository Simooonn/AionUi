/**
 * Shared helpers for the per-CLI parsers and messageParser. Lives in parsers/
 * so per-CLI modules can use them without importing messageParser (which itself
 * imports from parsers/* — keeping the dependency direction one-way).
 */

export const TOOL_OUTPUT_CAP = 8000;
const TOOL_TITLE_ARG_KEYS = ['command', 'cmd', 'file_path', 'path', 'pattern', 'url', 'query', 'skill', 'description'];

/** "Name primary-arg" one-line title, like the live claude-agent-acp titles. */
export function toolTitle(name: string, input: unknown): string {
  if (input && typeof input === 'object') {
    for (const key of TOOL_TITLE_ARG_KEYS) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) return `${name} ${v.replace(/\s+/g, ' ').trim().slice(0, 100)}`;
    }
  }
  return name;
}

export function capText(v: string): string {
  return v.length > TOOL_OUTPUT_CAP ? `${v.slice(0, TOOL_OUTPUT_CAP)}…` : v;
}

/** raw_input is display metadata; drop oversized ones (e.g. Workflow scripts). */
export function boundedRawInput(input: unknown): unknown {
  try {
    return JSON.stringify(input).length <= 4000 ? input : undefined;
  } catch {
    return undefined;
  }
}

/** Split a data URL into media type + base64 payload (Codex/opencode inline images this way). */
export function imageFromDataUrl(url: unknown): { mediaType: string; dataBase64: string } | null {
  if (typeof url !== 'string') return null;
  const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(url);
  return m ? { mediaType: m[1], dataBase64: m[2] } : null;
}
