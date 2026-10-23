// Turns free text into a board layout: uppercases, word-wraps, centers, and
// — when the message is too long — abbreviates words until it fits.

import { abbreviationFor } from "./abbreviations";
import { BLANK, BoardType, COLOR_CODES, ColorName, Layout, charToCode, emptyLayout } from "./characters";

export type Align = "center" | "left" | "right";
export type VAlign = "middle" | "top" | "bottom";

export interface FormatOptions {
  /** Decides how code 62 is used: a heart on the Note, a degree sign on the Flagship. */
  board: BoardType;
  rows: number;
  cols: number;
  align?: Align;
  valign?: VAlign;
  /** Highest abbreviation tier allowed (0 = never abbreviate, 3 = drop filler words too). */
  abbreviate?: number;
}

export interface FormatResult {
  layout: Layout;
  fits: boolean;
  /** Number of lines the message needs, which may exceed rows when it doesn't fit. */
  lineCount: number;
  abbreviations: { from: string; to: string }[];
}

interface Word {
  text: string;
}

const TOKEN = /\{([a-z]+|\d{1,2})\}/gi;

/** Symbol tokens, typed as {heart} or {degree}. They resolve per board like the characters themselves. */
const SYMBOL_TOKENS: Record<string, string> = { heart: "❤", degree: "°" };

/** Converts a run of text (no spaces) into character codes. Supports {red} / {63} / {heart} tokens and emoji. */
export function textToCells(text: string, board: BoardType): number[] {
  const cells: number[] = [];
  let last = 0;
  const pushChars = (s: string) => {
    for (const ch of Array.from(s.replace(/️/g, ""))) {
      const code = charToCode(ch, board);
      if (code !== undefined) cells.push(code);
    }
  };
  for (const m of text.matchAll(TOKEN)) {
    pushChars(text.slice(last, m.index));
    const name = m[1].toLowerCase();
    const code = /^\d+$/.test(name)
      ? Number(name)
      : name in SYMBOL_TOKENS
        ? charToCode(SYMBOL_TOKENS[name], board)
        : COLOR_CODES[name as ColorName];
    if (code !== undefined && code >= 0 && code <= 71) cells.push(code);
    last = (m.index ?? 0) + m[0].length;
  }
  pushChars(text.slice(last));
  return cells;
}

function parse(text: string): Word[][] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((p) =>
      p
        .split(/[ \t]+/)
        .filter(Boolean)
        .map((w) => ({ text: w.toUpperCase() })),
    );
}

interface Wrapped {
  lines: number[][];
  broken: boolean;
}

function wrap(paragraphs: Word[][], cols: number, board: BoardType): Wrapped {
  const lines: number[][] = [];
  let broken = false;
  for (const para of paragraphs) {
    let line: number[] = [];
    const flush = () => {
      lines.push(line);
      line = [];
    };
    for (const word of para) {
      let cells = textToCells(word.text, board);
      if (cells.length === 0) continue;
      if (line.length > 0 && line.length + 1 + cells.length <= cols) {
        line.push(BLANK, ...cells);
        continue;
      }
      if (line.length > 0) flush();
      while (cells.length > cols) {
        broken = true;
        line = cells.slice(0, cols);
        flush();
        cells = cells.slice(cols);
      }
      line = cells;
    }
    // Keep intentionally blank lines, but not trailing ones.
    if (line.length > 0 || para.length === 0) flush();
  }
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  return { lines, broken };
}

function core(word: string): [string, string, string] {
  const m = word.match(/^([^A-Z0-9']*)([A-Z0-9'][A-Z0-9']*?)([^A-Z0-9']*)$/);
  return m ? [m[1], m[2], m[3]] : ["", word, ""];
}

export function formatText(text: string, opts: FormatOptions): FormatResult {
  const { board, rows, cols, align = "center", valign = "middle", abbreviate = 2 } = opts;
  const paragraphs = parse(text);
  const used: { from: string; to: string }[] = [];
  const fitsNow = (w: Wrapped) => w.lines.length <= rows && !w.broken;

  let wrapped = wrap(paragraphs, cols, board);
  for (let tier = 1; tier <= abbreviate && !fitsNow(wrapped); tier++) {
    // Candidate words at this tier, biggest savings first.
    const candidates: { p: number; i: number; save: number }[] = [];
    paragraphs.forEach((para, p) =>
      para.forEach((w, i) => {
        const [pre, c, post] = core(w.text);
        const a = abbreviationFor(c, tier, board);
        if (!a || a.tier !== tier) return;
        // Only drop a filler word when it isn't attached to punctuation and isn't the whole line.
        const canDrop = !pre && !post && para.filter((x) => x.text).length > 1;
        if (a.short !== "" || canDrop) {
          candidates.push({ p, i, save: c.length - a.short.length });
        }
      }),
    );
    candidates.sort((a, b) => b.save - a.save);
    for (const { p, i } of candidates) {
      const w = paragraphs[p][i];
      const [pre, c, post] = core(w.text);
      const a = abbreviationFor(c, tier, board);
      if (!a) continue;
      if (a.short === "" && paragraphs[p].filter((x) => x.text).length <= 1) continue;
      w.text = pre + a.short + post;
      used.push({ from: c, to: a.short || "(removed)" });
      wrapped = wrap(paragraphs, cols, board);
      if (fitsNow(wrapped)) break;
    }
  }

  const layout = emptyLayout(rows, cols);
  const shown = wrapped.lines.slice(0, rows);
  const top = valign === "top" ? 0 : valign === "bottom" ? rows - shown.length : Math.floor((rows - shown.length) / 2);
  shown.forEach((line, r) => {
    const left = align === "left" ? 0 : align === "right" ? cols - line.length : Math.floor((cols - line.length) / 2);
    line.forEach((code, c) => (layout[top + r][left + c] = code));
  });

  return { layout, fits: fitsNow(wrapped), lineCount: wrapped.lines.length, abbreviations: used };
}
