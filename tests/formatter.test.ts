import { describe, expect, it } from "vitest";
import { formatText, textToCells } from "../src/shared/formatter";
import { layoutToText } from "../src/shared/characters";

const NOTE = { rows: 3, cols: 15 };

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
    expect(textToCells("{red}{63}🟦’A")).toEqual([63, 63, 67, 52, 1]);
    expect(textToCells("72°")).toEqual([33, 28, 62]);
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
    const r = formatText("Dentist appointment tomorrow afternoon", { rows: 6, cols: 22 });
    expect(r.fits).toBe(true);
    expect(r.abbreviations).toEqual([]);
  });
});
