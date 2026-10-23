// Vestaboard character codes. A board "layout" is a rows x cols grid of these codes.
// Reference: https://docs.vestaboard.com/docs/charactercodes

export type Layout = number[][];

export type BoardType = "note" | "flagship";

export const BOARD_SIZES: Record<BoardType, { rows: number; cols: number; label: string }> = {
  note: { rows: 3, cols: 15, label: "Vestaboard Note" },
  flagship: { rows: 6, cols: 22, label: "Vestaboard (Flagship)" },
};

export const BLANK = 0;

export const COLOR_CODES = {
  red: 63,
  orange: 64,
  yellow: 65,
  green: 66,
  blue: 67,
  violet: 68,
  white: 69,
  black: 70,
  filled: 71,
} as const;

export type ColorName = keyof typeof COLOR_CODES;

export const COLOR_HEX: Record<number, string> = {
  63: "#d8343d",
  64: "#f08a24",
  65: "#f6c02c",
  66: "#2f9e5b",
  67: "#1f74c9",
  68: "#7b48b5",
  69: "#f4f2ee",
  70: "#151515",
};

const CHAR_TO_CODE: Record<string, number> = {
  " ": 0,
  "1": 27, "2": 28, "3": 29, "4": 30, "5": 31, "6": 32, "7": 33, "8": 34, "9": 35, "0": 36,
  "!": 37, "@": 38, "#": 39, "$": 40, "(": 41, ")": 42, "-": 44, "+": 46, "&": 47, "=": 48,
  ";": 49, ":": 50, "'": 52, '"': 53, "%": 54, ",": 55, ".": 56, "/": 59, "?": 60,
};
for (let i = 0; i < 26; i++) CHAR_TO_CODE[String.fromCharCode(65 + i)] = i + 1;

export const CODE_TO_CHAR: Record<number, string> = {};
for (const [ch, code] of Object.entries(CHAR_TO_CODE)) CODE_TO_CHAR[code] = ch;

/** Code 62 is the only character that differs by model: a degree sign on the Flagship, a heart on the Note. */
export const SYMBOL_62 = 62;
const SYMBOL_62_GLYPH: Record<BoardType, string> = { flagship: "°", note: "❤" };
const HEARTS = new Set(["❤", "♥", "♡", "💗", "💖", "💕"]);

/** Which board a layout was made for, judged by its width. */
export function boardTypeOf(layout: Layout): BoardType {
  return (layout[0]?.length ?? 0) === BOARD_SIZES.note.cols ? "note" : "flagship";
}

/** The character shown for a (non-color) code on the given board. */
export function glyph(code: number, board: BoardType): string {
  return code === SYMBOL_62 ? SYMBOL_62_GLYPH[board] : CODE_TO_CHAR[code] ?? "";
}

// Characters that are easy to type but not on the board, mapped to something that is.
const SUBSTITUTIONS: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...",
  "_": "-", "*": "+", "~": "-", "[": "(", "]": ")", "<": "(", ">": ")", "\t": " ",
  "é": "E", "è": "E", "ê": "E", "á": "A", "à": "A", "ñ": "N", "ó": "O", "ö": "O",
  "ü": "U", "ú": "U", "í": "I", "ç": "C",
};

// Emoji that map to color tiles, so people can type 🟥 or 💙 on their phone.
const EMOJI_COLORS: Record<string, number> = {
  "🟥": 63, "🟧": 64, "🧡": 64, "🟨": 65, "💛": 65,
  "🟩": 66, "💚": 66, "🟦": 67, "💙": 67, "🟪": 68, "💜": 68, "⬜": 69, "🤍": 69,
  "⬛": 70, "🖤": 70,
};

export function charToCode(ch: string, board: BoardType): number | undefined {
  // Hearts are a real character on the Note; on the Flagship the closest thing is a red tile.
  if (HEARTS.has(ch)) return board === "note" ? SYMBOL_62 : COLOR_CODES.red;
  // The degree sign only exists on the Flagship.
  if (ch === "°") return board === "flagship" ? SYMBOL_62 : undefined;
  if (ch in EMOJI_COLORS) return EMOJI_COLORS[ch];
  const sub = SUBSTITUTIONS[ch] ?? ch;
  return CHAR_TO_CODE[sub.toUpperCase()];
}

export function isColor(code: number): boolean {
  return code >= 63 && code <= 71;
}

/** All characters a user can place on the board, for the designer palette. */
export const PALETTE = {
  colors: [63, 64, 65, 66, 67, 68, 69, 70],
  letters: Array.from({ length: 26 }, (_, i) => i + 1),
  digits: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
  symbols: [37, 38, 39, 40, 41, 42, 44, 46, 47, 48, 49, 50, 52, 53, 54, 55, 56, 59, 60, 62],
};

export function emptyLayout(rows: number, cols: number): Layout {
  return Array.from({ length: rows }, () => Array<number>(cols).fill(BLANK));
}

/** Crop or pad a layout to the given size (e.g. after switching board type). */
export function normalizeLayout(layout: Layout, rows: number, cols: number): Layout {
  const out = emptyLayout(rows, cols);
  for (let r = 0; r < Math.min(rows, layout.length); r++) {
    for (let c = 0; c < Math.min(cols, layout[r]?.length ?? 0); c++) {
      const v = layout[r][c];
      out[r][c] = Number.isInteger(v) && v >= 0 && v <= 71 ? v : BLANK;
    }
  }
  return out;
}

export function layoutToText(layout: Layout): string {
  const board = boardTypeOf(layout);
  return layout
    .map((row) => row.map((c) => (isColor(c) ? "■" : glyph(c, board) || " ")).join("").trimEnd())
    .join("\n")
    .trim();
}

export function isLayoutBlank(layout: Layout): boolean {
  return layout.every((row) => row.every((c) => c === BLANK));
}
