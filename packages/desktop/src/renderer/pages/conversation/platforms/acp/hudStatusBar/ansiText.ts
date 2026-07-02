/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal ANSI SGR parser for statusline output. Turns a line of ANSI-colored
 * text into styled segments the HUD status bar renders as spans. Handles the
 * SGR subset statusline scripts actually emit (reset, bold, dim, italic,
 * underline, 16-color foregrounds); other escape sequences are stripped.
 */

export type AnsiSegment = {
  text: string;
  /** Semantic style keys, mapped to CSS-module classes by the renderer. */
  classes: string[];
};

type SgrState = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fg: string | null;
};

const FG_CLASS: Record<number, string> = {
  30: 'fgBlack',
  31: 'fgRed',
  32: 'fgGreen',
  33: 'fgYellow',
  34: 'fgBlue',
  35: 'fgMagenta',
  36: 'fgCyan',
  37: 'fgWhite',
  90: 'fgGray',
  91: 'fgRed',
  92: 'fgGreen',
  93: 'fgYellow',
  94: 'fgBlue',
  95: 'fgMagenta',
  96: 'fgCyan',
  97: 'fgWhite',
};

const initialState = (): SgrState => ({ bold: false, dim: false, italic: false, underline: false, fg: null });

const stateClasses = (s: SgrState): string[] => {
  const classes: string[] = [];
  if (s.bold) classes.push('bold');
  if (s.dim) classes.push('dim');
  if (s.italic) classes.push('italic');
  if (s.underline) classes.push('underline');
  if (s.fg) classes.push(s.fg);
  return classes;
};

/** Apply one SGR parameter list (e.g. "1;32") to the style state. */
function applySgr(params: string, state: SgrState): void {
  const codes = params === '' ? [0] : params.split(';').map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) Object.assign(state, initialState());
    else if (code === 1) state.bold = true;
    else if (code === 2) state.dim = true;
    else if (code === 3) state.italic = true;
    else if (code === 4) state.underline = true;
    else if (code === 22) {
      state.bold = false;
      state.dim = false;
    } else if (code === 23) state.italic = false;
    else if (code === 24) state.underline = false;
    else if (code === 39) state.fg = null;
    else if (code === 38 || code === 48) {
      // 256-color / truecolor: consume arguments, render unstyled.
      i += codes[i + 1] === 5 ? 2 : codes[i + 1] === 2 ? 4 : 0;
    } else if (FG_CLASS[code]) state.fg = FG_CLASS[code];
    // background + unknown codes: ignored
  }
}

// CSI sequences (ESC [ ... final-byte); SGR is final byte "m".
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1b\[([0-9;]*)([\x40-\x7e])/g;

/** Parse one line of ANSI text into styled segments (escape-free). */
export function parseAnsiLine(line: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const state = initialState();
  let lastIndex = 0;

  const push = (text: string) => {
    if (!text) return;
    const classes = stateClasses(state);
    const prev = segments[segments.length - 1];
    if (prev && prev.classes.join(' ') === classes.join(' ')) prev.text += text;
    else segments.push({ text, classes });
  };

  CSI_RE.lastIndex = 0;
  for (let m = CSI_RE.exec(line); m; m = CSI_RE.exec(line)) {
    push(line.slice(lastIndex, m.index));
    if (m[2] === 'm') applySgr(m[1], state);
    // non-SGR CSI sequences: stripped
    lastIndex = m.index + m[0].length;
  }
  push(line.slice(lastIndex));
  return segments;
}
