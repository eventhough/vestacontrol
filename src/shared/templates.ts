// Ready-made messages and designs to start from, like the official app's
// Templates. Each one is built for the board it's used on, so it fits both the
// Note (3x15) and the Flagship (6x22). Plain messages stay editable as text;
// striped ones become designs, since a text box full of color codes is hard to edit.

import { BOARD_SIZES, BoardType, COLOR_CODES, Layout, emptyLayout } from "./characters";
import { formatText } from "./formatter";
import type { NoteContent } from "./types";

export type TemplateCategory = "celebrate" | "holidays" | "reminders" | "home" | "patterns";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string; icon: string }[] = [
  { id: "celebrate", label: "Celebrate", icon: "🎉" },
  { id: "holidays", label: "Holidays", icon: "🎄" },
  { id: "reminders", label: "Reminders", icon: "📝" },
  { id: "home", label: "Home", icon: "🏡" },
  { id: "patterns", label: "Patterns", icon: "🌈" },
];

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Shown after picking, e.g. which placeholder words to replace. */
  hint?: string;
  build: (board: BoardType) => NoteContent;
}

type Color = Exclude<keyof typeof COLOR_CODES, "filled">;
const RAINBOW: Color[] = ["red", "orange", "yellow", "green", "blue", "violet"];

const stripe = (cols: number, colors: Color[]) => Array.from({ length: cols }, (_, i) => `{${colors[i % colors.length]}}`).join("");

/** A message between two colored stripes. The Flagship gets breathing room and can use a longer wording. */
function framed(colors: Color[], noteBody: string, flagshipBody = noteBody) {
  return (board: BoardType): NoteContent => {
    const size = BOARD_SIZES[board];
    const top = stripe(size.cols, colors);
    const bottom = stripe(size.cols, [...colors].reverse());
    const body = board === "note" ? noteBody : flagshipBody;
    const roomy = board === "flagship" && body.split("\n").length <= 2;
    const text = roomy ? `${top}\n\n${body}\n\n${bottom}` : `${top}\n${body}\n${bottom}`;
    const r = formatText(text, { board, ...size, abbreviate: 0 });
    // If it somehow doesn't fit, hand over the text so the composer shows the problem instead of cutting it off.
    return r.fits ? { type: "design", layout: r.layout } : { type: "text", text };
  };
}

const plain = (text: string) => (): NoteContent => ({ type: "text", text });

function design(paint: (r: number, c: number, rows: number, cols: number) => number) {
  return (board: BoardType): NoteContent => {
    const { rows, cols } = BOARD_SIZES[board];
    const layout: Layout = emptyLayout(rows, cols).map((row, r) => row.map((_, c) => paint(r, c, rows, cols)));
    return { type: "design", layout };
  };
}

const code = (c: Color) => COLOR_CODES[c];

export const TEMPLATES: Template[] = [
  // ---------- celebrate ----------
  { id: "birthday", name: "Happy birthday", category: "celebrate", build: framed(RAINBOW, "HAPPY BIRTHDAY", "HAPPY BIRTHDAY!") },
  { id: "birthday-name", name: "Birthday shout-out", category: "celebrate", hint: "Replace NAME.", build: plain("HAPPY BIRTHDAY\nNAME! WE LOVE\nYOU {heart}") },
  { id: "congrats", name: "Congrats", category: "celebrate", build: framed(["yellow", "green"], "CONGRATS!", "CONGRATULATIONS!") },
  { id: "anniversary", name: "Anniversary", category: "celebrate", build: plain("{red} HAPPY {red}\nANNIVERSARY!") },
  { id: "welcome-home", name: "Welcome home", category: "celebrate", build: framed(["blue", "green"], "WELCOME HOME!") },
  { id: "good-luck", name: "Good luck", category: "celebrate", build: framed(["green", "white"], "GOOD LUCK!", "GOOD LUCK TODAY!") },
  { id: "proud", name: "Proud of you", category: "celebrate", build: plain("{yellow} SO PROUD {yellow}\nOF YOU!") },

  // ---------- holidays ----------
  { id: "new-year", name: "New Year", category: "holidays", build: framed(["yellow", "white"], "HAPPY NEW YEAR!") },
  { id: "valentines", name: "Valentine's Day", category: "holidays", build: framed(["red", "violet"], "BE MY VALENTINE", "HAPPY\nVALENTINE'S DAY") },
  { id: "st-patricks", name: "St. Patrick's Day", category: "holidays", build: framed(["green", "white"], "HAPPY ST PAT'S!", "HAPPY\nST. PATRICK'S DAY") },
  { id: "easter", name: "Easter", category: "holidays", build: framed(["violet", "yellow", "green"], "HAPPY EASTER!") },
  { id: "july-4", name: "4th of July", category: "holidays", build: framed(["red", "white", "blue"], "HAPPY 4TH!", "HAPPY 4TH OF JULY!") },
  { id: "halloween", name: "Halloween", category: "holidays", build: framed(["orange", "violet"], "HAPPY HALLOWEEN") },
  { id: "thanksgiving", name: "Thanksgiving", category: "holidays", build: framed(["orange", "yellow", "red"], "GIVE THANKS", "HAPPY THANKSGIVING") },
  { id: "christmas", name: "Christmas", category: "holidays", build: framed(["red", "green"], "MERRY CHRISTMAS") },
  { id: "hanukkah", name: "Hanukkah", category: "holidays", build: framed(["blue", "white"], "HAPPY HANUKKAH") },
  { id: "holidays", name: "Happy holidays", category: "holidays", build: framed(["red", "green", "white"], "HAPPY HOLIDAYS") },

  // ---------- reminders ----------
  { id: "trash", name: "Trash night", category: "reminders", build: plain("{green} TRASH NIGHT {green}\nTAKE THE BINS\nTO THE CURB") },
  { id: "lunch", name: "Lunch", category: "reminders", build: plain("DON'T FORGET\nYOUR LUNCH!") },
  { id: "dinner", name: "Dinner time", category: "reminders", hint: "Change the time.", build: plain("DINNER AT 6\nSEE YOU THERE") },
  { id: "homework", name: "Homework first", category: "reminders", build: plain("HOMEWORK FIRST\nTHEN SCREENS") },
  { id: "water", name: "Drink water", category: "reminders", build: plain("{blue} DRINK WATER {blue}") },
  { id: "lock-door", name: "Lock the door", category: "reminders", build: plain("LAST ONE OUT\nLOCK THE DOOR!") },
  { id: "appointment", name: "Appointment", category: "reminders", hint: "Change the time.", build: plain("APPOINTMENT\nTODAY AT 3:00") },

  // ---------- home ----------
  { id: "good-morning", name: "Good morning", category: "home", build: framed(["yellow", "orange"], "GOOD MORNING!") },
  { id: "good-night", name: "Good night", category: "home", build: framed(["violet", "blue"], "GOOD NIGHT") },
  { id: "guests", name: "Welcome guests", category: "home", build: plain("WELCOME!\nMAKE YOURSELF\nAT HOME") },
  { id: "wifi", name: "Wi-Fi details", category: "home", hint: "Replace NETWORK and PASSWORD. Anyone who can see the board can read them.", build: plain("WIFI: NETWORK\nPASS: PASSWORD") },
  { id: "family-meeting", name: "Family meeting", category: "home", build: plain("FAMILY MEETING\nTONIGHT AT 7") },
  { id: "love-you", name: "I love you", category: "home", build: plain("I {heart} YOU\nSO MUCH") },

  // ---------- patterns ----------
  { id: "rainbow", name: "Rainbow", category: "patterns", build: design((r, c) => code(RAINBOW[(r + c) % RAINBOW.length])) },
  { id: "sunset", name: "Sunset", category: "patterns", build: design((r, _c, rows) => code((["red", "orange", "yellow"] as Color[])[Math.floor((r * 3) / rows)])) },
  { id: "checkers", name: "Checkerboard", category: "patterns", build: design((r, c) => code((r + c) % 2 ? "blue" : "white")) },
  {
    id: "rainbow-border",
    name: "Rainbow border",
    category: "patterns",
    hint: "Switch to Type mode to write inside the border.",
    build: design((r, c, rows, cols) => (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ? code(RAINBOW[(r + c) % RAINBOW.length]) : 0)),
  },
  { id: "confetti", name: "Confetti", category: "patterns", build: design((r, c) => ((r * 7 + c * 5) % 4 === 0 ? code(RAINBOW[(r * 3 + c) % RAINBOW.length]) : 0)) },
];
