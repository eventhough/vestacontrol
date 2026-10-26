import { describe, expect, it } from "vitest";
import { formatText, textToCells } from "../src/shared/formatter";
import { layoutToText } from "../src/shared/characters";

const NOTE = { board: "note" as const, rows: 3, cols: 15 };
const FLAGSHIP = { board: "flagship" as const, rows: 6, cols: 22 };

describe("formatText", () => {
  it("centers a short message", () => {
    const r = formatText("hello", NOTE);
    expect(r.fits).toBe(true);
    expect(r.layout[1].slice(5, 10)).toEqual([8, 5, 12, 12, 15]);
    expect(r.abbreviations).toEqual([]);
  });

  it("wraps words across lines", () => {
    const r = formatText("Happy birthday to the best mom", NOTE);
    expect(r.fits).toBe(true);
    expect(layoutToText(r.layout).split("\n").map((l) => l.trim())).toEqual(["HAPPY BIRTHDAY", "TO THE BEST MOM"]);
  });

  it("abbreviates only when needed, biggest savings first", () => {
    const r = formatText("Dentist appointment tomorrow afternoon", NOTE);
    expect(r.fits).toBe(true);
    expect(r.abbreviations.map((a) => a.from)).toContain("APPOINTMENT");
    expect(layoutToText(r.layout)).toContain("APPT");
  });

  it("keeps punctuation around abbreviated words", () => {
    const r = formatText("See you tomorrow! Love you lots and lots", NOTE);
    expect(layoutToText(r.layout)).toContain("TMRW!");
  });

  it("respects abbreviate = 0", () => {
    const r = formatText("Dentist appointment tomorrow afternoon at four", { ...NOTE, abbreviate: 0 });
    expect(r.abbreviations).toEqual([]);
    expect(r.fits).toBe(false);
  });

  it("reports overflow for text that can never fit", () => {
    const r = formatText("x ".repeat(60), NOTE);
    expect(r.fits).toBe(false);
    expect(r.lineCount).toBeGreaterThan(3);
  });

  it("honors explicit line breaks", () => {
    const r = formatText("one\ntwo", { ...NOTE, valign: "top", align: "left" });
    expect(layoutToText(r.layout)).toBe("ONE\nTWO");
  });
});

describe("textToCells", () => {
  it("parses color tokens, emoji and substitutions", () => {
    expect(textToCells("{red}{63}🟦’A", "note")).toEqual([63, 63, 67, 52, 1]);
  });

  it("uses code 62 as a heart on the Note and a degree sign on the Flagship", () => {
    expect(textToCells("72°", "flagship")).toEqual([33, 28, 62]);
    expect(textToCells("72°", "note")).toEqual([33, 28]);
    expect(textToCells("❤️♥{heart}", "note")).toEqual([62, 62, 62]);
    expect(textToCells("❤️{heart}", "flagship")).toEqual([63, 63]);
    expect(textToCells("{degree}", "flagship")).toEqual([62]);
    expect(textToCells("{degree}", "note")).toEqual([]);
  });
});

describe("abbreviation tiers", () => {
  it("drops filler words only at max level", () => {
    const text = "Take the dog to the park after the game";
    expect(formatText(text, { ...NOTE, abbreviate: 2 }).abbreviations.some((a) => a.to === "(removed)")).toBe(false);
    const max = formatText("Please remember the appointment with the doctor tomorrow", { ...NOTE, abbreviate: 3 });
    expect(max.fits).toBe(true);
  });

  it("works on the flagship without abbreviating", () => {
    const r = formatText("Dentist appointment tomorrow afternoon", FLAGSHIP);
    expect(r.fits).toBe(true);
    expect(r.abbreviations).toEqual([]);
  });
});

describe("board-specific abbreviations", () => {
  it("shortens LOVE to a heart on the Note", () => {
    const r = formatText("Have a great day at school, love you lots, Mom", NOTE);
    expect(r.fits).toBe(true);
    expect(r.abbreviations).toEqual([{ from: "LOVE", to: "❤" }]);
    expect(layoutToText(r.layout)).toContain("❤ YOU LOTS, MOM");
  });

  it("never abbreviates to a degree sign on the Note", () => {
    const r = formatText("It is seventy two degrees outside today friends", NOTE);
    expect(r.abbreviations.map((a) => a.to)).not.toContain("°");
  });
});

describe("only keeps shortening that's needed", () => {
  it("undoes an early pick when a later one alone makes it fit", () => {
    // MORNING -> MORN saves the most, but GREAT -> GR8 alone is enough.
    const r = formatText("{red}{orange}{yellow}\nGood morning!\nHave a great day", NOTE);
    expect(r.fits).toBe(true);
    expect(r.abbreviations).toEqual([{ from: "GREAT", to: "GR8" }]);
    expect(layoutToText(r.layout)).toContain("GOOD MORNING!");
  });

  it("keeps every shortening that is really needed", () => {
    const r = formatText("Dentist appointment tomorrow afternoon, love you!", NOTE);
    expect(r.fits).toBe(true);
    expect(r.abbreviations.map((a) => a.from).sort()).toEqual(["AFTERNOON", "APPOINTMENT"]);
  });
});
